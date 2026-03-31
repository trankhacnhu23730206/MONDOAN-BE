const pool = require("../config/db");

// CREATE PRODUCT
const createProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập tên sản phẩm",
      });
    }

    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({
        message: "Giá sản phẩm không hợp lệ",
      });
    }

    if (stock === undefined || stock === null || Number(stock) < 0) {
      return res.status(400).json({
        message: "Số lượng tồn không hợp lệ",
      });
    }

    if (!category_id) {
      return res.status(400).json({
        message: "Vui lòng chọn danh mục",
      });
    }

    const [categories] = await pool.execute(
      "SELECT id FROM categories WHERE id = ?",
      [category_id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        message: "Danh mục không tồn tại",
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO products (name, description, price, stock, category_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), description || null, Number(price), Number(stock), category_id]
    );

    return res.status(201).json({
      message: "Tạo sản phẩm thành công",
      product: {
        id: result.insertId,
        name: name.trim(),
        description: description || null,
        price: Number(price),
        stock: Number(stock),
        category_id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi tạo sản phẩm",
      error: error.message,
    });
  }
};

// GET ALL PRODUCTS
const getAllProducts = async (req, res) => {
  try {
    const [products] = await pool.execute(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.category_id,
        c.name AS category_name,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id DESC
    `);

    return res.status(200).json({
      message: "Lấy danh sách sản phẩm thành công",
      products,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách sản phẩm",
      error: error.message,
    });
  }
};

// GET PRODUCT BY ID
// const getProductById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const [products] = await pool.execute(
//       `
//       SELECT 
//         p.id,
//         p.name,
//         p.description,
//         p.price,
//         p.stock,
//         p.category_id,
//         c.name AS category_name,
//         p.created_at,
//         p.updated_at
//       FROM products p
//       LEFT JOIN categories c ON p.category_id = c.id
//       WHERE p.id = ?
//       `,
//       [id]
//     );

//     if (products.length === 0) {
//       return res.status(404).json({
//         message: "Không tìm thấy sản phẩm",
//       });
//     }

//     return res.status(200).json({
//       message: "Lấy chi tiết sản phẩm thành công",
//       product: products[0],
//     });
//   } catch (error) {
//     return res.status(500).json({
//       message: "Lỗi server khi lấy chi tiết sản phẩm",
//       error: error.message,
//     });
//   }
// };


const getProductsByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;



    const [products] = await pool.execute(
      `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.category_id,
        c.name AS category_name,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id = ?
      `,
      [categoryId]
    );

    return res.status(200).json({
      message: "Lấy danh sách sản phẩm theo danh mục thành công",
      products,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy sản phẩm theo danh mục",
      error: error.message,
    });
  }
};

// UPDATE PRODUCT
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, category_id } = req.body;

    const [products] = await pool.execute(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy sản phẩm",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập tên sản phẩm",
      });
    }

    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({
        message: "Giá sản phẩm không hợp lệ",
      });
    }

    if (stock === undefined || stock === null || Number(stock) < 0) {
      return res.status(400).json({
        message: "Số lượng tồn không hợp lệ",
      });
    }

    if (!category_id) {
      return res.status(400).json({
        message: "Vui lòng chọn danh mục",
      });
    }

    const [categories] = await pool.execute(
      "SELECT id FROM categories WHERE id = ?",
      [category_id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        message: "Danh mục không tồn tại",
      });
    }

    await pool.execute(
      `UPDATE products 
       SET name = ?, description = ?, price = ?, stock = ?, category_id = ?
       WHERE id = ?`,
      [name.trim(), description || null, Number(price), Number(stock), category_id, id]
    );

    return res.status(200).json({
      message: "Cập nhật sản phẩm thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi cập nhật sản phẩm",
      error: error.message,
    });
  }
};

// DELETE PRODUCT
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const [products] = await pool.execute(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy sản phẩm",
      });
    }

    await pool.execute("DELETE FROM products WHERE id = ?", [id]);

    return res.status(200).json({
      message: "Xóa sản phẩm thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi xóa sản phẩm",
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductsByCategoryId,
  updateProduct,
  deleteProduct,
};