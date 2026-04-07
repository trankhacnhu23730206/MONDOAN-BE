const pool = require("../config/db");

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

// POST /api/orders
const createOrder = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      items,
      receiver_name,
      receiver_phone,
      shipping_address,
      note,
      payment_method = "COD",
    } = req.body;

    const allowedPaymentMethods = ["COD", "BANK_TRANSFER", "VNPAY", "MOMO"];

    if (!receiver_name?.trim()) fail(400, "Vui lòng nhập tên người nhận");
    if (!receiver_phone?.trim()) fail(400, "Vui lòng nhập số điện thoại người nhận");
    if (!shipping_address?.trim()) fail(400, "Vui lòng nhập địa chỉ giao hàng");
    if (!Array.isArray(items) || items.length === 0) {
      fail(400, "Danh sách sản phẩm không hợp lệ");
    }
    if (!allowedPaymentMethods.includes(payment_method)) {
      fail(400, "Phương thức thanh toán không hợp lệ");
    }

    await connection.beginTransaction();

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        fail(400, "product_id hoặc quantity không hợp lệ");
      }

      const [products] = await connection.execute(
        "SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );

      if (products.length === 0) {
        fail(404, `Sản phẩm ${productId} không tồn tại`);
      }

      const product = products[0];

      if (Number(product.stock) < quantity) {
        fail(400, `Sản phẩm ${product.name} không đủ tồn kho`);
      }

      const price = Number(product.price);
      const subtotal = price * quantity;
      totalAmount += subtotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        product_price: price,
        quantity,
        subtotal,
      });
    }

    totalAmount = Number(totalAmount.toFixed(2));
    const paymentStatus = payment_method === "COD" ? "unpaid" : "pending";

    const [orderResult] = await connection.execute(
      `INSERT INTO orders
      (user_id, receiver_name, receiver_phone, shipping_address, note, total_amount, status, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        req.user.id,
        receiver_name.trim(),
        receiver_phone.trim(),
        shipping_address.trim(),
        note || null,
        totalAmount,
        payment_method,
        paymentStatus,
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
        (order_id, product_id, product_name, product_price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_price,
          item.quantity,
          item.subtotal,
        ]
      );

      await connection.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await connection.execute(
      `INSERT INTO payments (order_id, user_id, method, amount, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [orderId, req.user.id, payment_method, totalAmount]
    );

    await connection.commit();

    return res.status(201).json({
      message: "Tạo đơn hàng thành công",
      order: {
        id: orderId,
        user_id: req.user.id,
        total_amount: totalAmount,
        status: "pending",
        payment_method,
        payment_status: paymentStatus,
        receiver_name: receiver_name.trim(),
        receiver_phone: receiver_phone.trim(),
        shipping_address: shipping_address.trim(),
        note: note || null,
        items: orderItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi tạo đơn hàng",
    });
  } finally {
    connection.release();
  }
};

// GET /api/orders/my-orders
const getMyOrders = async (req, res) => {
  try {
    const [orders] = await pool.execute(
      `SELECT
        id,
        total_amount,
        order_status,
        payment_method,
        payment_status,
        shipping_full_name,
        shipping_phone,
        shipping_address_line1,
        note,
        created_at,
        updated_at
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      message: "Lấy danh sách đơn hàng thành công",
      orders,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách đơn hàng",
      error: error.message,
    });
  }
};

// GET /api/orders/:id
const getMyOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders] = await pool.execute(
      `SELECT
        id,
        user_id,
        total_amount,
        status,
        payment_method,
        payment_status,
        receiver_name,
        receiver_phone,
        shipping_address,
        note,
        created_at,
        updated_at
      FROM orders
      WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const [items] = await pool.execute(
      `SELECT
        id,
        product_id,
        product_name,
        product_price,
        quantity,
        subtotal,
        created_at
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC`,
      [id]
    );

    return res.status(200).json({
      message: "Lấy chi tiết đơn hàng thành công",
      order: {
        ...orders[0],
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy chi tiết đơn hàng",
      error: error.message,
    });
  }
};

// PATCH /api/orders/:id/cancel
const cancelMyOrder = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    const [orders] = await connection.execute(
      "SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, req.user.id]
    );

    if (orders.length === 0) fail(404, "Không tìm thấy đơn hàng");

    const order = orders[0];

    if (["shipping", "delivered", "cancelled"].includes(order.status)) {
      fail(400, "Đơn hàng không thể hủy ở trạng thái hiện tại");
    }

    if (order.payment_status === "paid") {
      fail(400, "Đơn hàng đã thanh toán, cần xử lý hoàn tiền riêng");
    }

    const [items] = await connection.execute(
      "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
      [id]
    );

    for (const item of items) {
      await connection.execute(
        "UPDATE products SET stock = stock + ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await connection.execute(
      `UPDATE orders
       SET status = 'cancelled', payment_status = 'failed'
       WHERE id = ?`,
      [id]
    );

    await connection.execute(
      `UPDATE payments
       SET status = 'failed'
       WHERE order_id = ? AND status = 'pending'`,
      [id]
    );

    await connection.commit();

    return res.status(200).json({
      message: "Hủy đơn hàng thành công",
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi hủy đơn hàng",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
};