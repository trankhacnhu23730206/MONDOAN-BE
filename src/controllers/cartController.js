const pool = require("../config/db");

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const getActiveCartId = async (connection, userId) => {
  const [rows] = await connection.execute(
    "SELECT id FROM carts WHERE user_id = ? AND status = 'active' LIMIT 1",
    [userId]
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const [result] = await connection.execute(
    "INSERT INTO carts (user_id, status) VALUES (?, 'active')",
    [userId]
  );

  return result.insertId;
};

const addToCart = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = req.user.id;
    const productId = Number(req.body.product_id);
    const quantity = Number(req.body.quantity || 1);

    if (!Number.isInteger(productId) || productId <= 0) {
      fail(400, "product_id không hợp lệ");
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      fail(400, "quantity phải là số nguyên lớn hơn 0");
    }

    await connection.beginTransaction();

    const [products] = await connection.execute(
      "SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE",
      [productId]
    );

    if (products.length === 0) {
      fail(404, "Sản phẩm không tồn tại");
    }

    const product = products[0];

    if (Number(product.stock) < quantity) {
      fail(400, "Số lượng sản phẩm vượt quá tồn kho");
    }

    const cartId = await getActiveCartId(connection, userId);

    const [existingItems] = await connection.execute(
      "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1",
      [cartId, productId]
    );

    let cartItemId;
    if (existingItems.length > 0) {
      cartItemId = existingItems[0].id;
      const newQuantity = existingItems[0].quantity + quantity;
      await connection.execute(
        "UPDATE cart_items SET quantity = ? WHERE id = ?",
        [newQuantity, cartItemId]
      );
    } else {
      const [result] = await connection.execute(
        "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
        [cartId, productId, quantity]
      );
      cartItemId = result.insertId;
    }

    await connection.commit();

    return res.status(201).json({
      message: "Thêm sản phẩm vào giỏ hàng thành công",
      cart_item_id: cartItemId,
      cart_id: cartId,
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi thêm sản phẩm vào giỏ hàng",
    });
  } finally {
    connection.release();
  }
};

const getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const [carts] = await pool.execute(
      "SELECT id FROM carts WHERE user_id = ? AND status = 'active' LIMIT 1",
      [userId]
    );

    if (carts.length === 0) {
      return res.status(200).json({
        message: "Lấy giỏ hàng thành công",
        cart: {
          id: null,
          items: [],
          total: 0,
        },
      });
    }

    const cartId = carts[0].id;

    const [items] = await pool.execute(
      `SELECT
         ci.id,
         ci.product_id,
         ci.quantity,
         p.name,
         p.price,
         p.thumbnail_url,
         p.stock,
         (ci.quantity * p.price) AS subtotal
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = ?`,
      [cartId]
    );

    const total = items.reduce((sum, item) => sum + Number(item.subtotal), 0);

    return res.status(200).json({
      message: "Lấy giỏ hàng thành công",
      cart: {
        id: cartId,
        items,
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Lỗi server khi lấy giỏ hàng",
    });
  }
};

const updateCartItem = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = req.user.id;
    const itemId = Number(req.params.itemId);
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      fail(400, "cart item id không hợp lệ");
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      fail(400, "quantity phải là số nguyên >= 0");
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, p.stock
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = ? AND c.user_id = ? AND c.status = 'active' LIMIT 1`,
      [itemId, userId]
    );

    if (rows.length === 0) {
      fail(404, "Không tìm thấy sản phẩm trong giỏ hàng");
    }

    const cartItem = rows[0];

    if (quantity === 0) {
      await connection.execute("DELETE FROM cart_items WHERE id = ?", [itemId]);
    } else {
      if (quantity > cartItem.stock) {
        fail(400, "Số lượng sản phẩm vượt quá tồn kho");
      }
      await connection.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", [quantity, itemId]);
    }

    await connection.commit();

    return res.status(200).json({
      message: "Cập nhật giỏ hàng thành công",
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi cập nhật giỏ hàng",
    });
  } finally {
    connection.release();
  }
};

const removeCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = Number(req.params.itemId);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      fail(400, "cart item id không hợp lệ");
    }

    const [rows] = await pool.execute(
      `SELECT ci.id
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       WHERE ci.id = ? AND c.user_id = ? AND c.status = 'active' LIMIT 1`,
      [itemId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }

    await pool.execute("DELETE FROM cart_items WHERE id = ?", [itemId]);

    return res.status(200).json({
      message: "Xóa sản phẩm khỏi giỏ hàng thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Lỗi server khi xóa sản phẩm khỏi giỏ hàng",
    });
  }
};

module.exports = {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
};
