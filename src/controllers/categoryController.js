const pool = require("../config/db");

// CREATE CATEGORY
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập tên danh mục",
      });
    }

    const [existingCategories] = await pool.execute(
      "SELECT id FROM categories WHERE name = ?",
      [name.trim()]
    );

    if (existingCategories.length > 0) {
      return res.status(409).json({
        message: "Danh mục đã tồn tại",
      });
    }

    const [result] = await pool.execute(
      "INSERT INTO categories (name, description) VALUES (?, ?)",
      [name.trim(), description || null]
    );

    return res.status(201).json({
      message: "Tạo danh mục thành công",
      category: {
        id: result.insertId,
        name: name.trim(),
        description: description || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi tạo danh mục",
      error: error.message,
    });
  }
};

// GET ALL CATEGORIES
const getAllCategories = async (req, res) => {
  try {
    const [categories] = await pool.execute(
      "SELECT id, name, description, created_at, updated_at FROM categories ORDER BY id DESC"
    );

    return res.status(200).json({
      message: "Lấy danh sách danh mục thành công",
      categories,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách danh mục",
      error: error.message,
    });
  }
};

// GET CATEGORY BY ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const [categories] = await pool.execute(
      "SELECT id, name, description, created_at, updated_at FROM categories WHERE id = ?",
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy danh mục",
      });
    }

    return res.status(200).json({
      message: "Lấy chi tiết danh mục thành công",
      category: categories[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy chi tiết danh mục",
      error: error.message,
    });
  }
};

// UPDATE CATEGORY
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const [categories] = await pool.execute(
      "SELECT * FROM categories WHERE id = ?",
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy danh mục",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập tên danh mục",
      });
    }

    const [existingCategories] = await pool.execute(
      "SELECT id FROM categories WHERE name = ? AND id != ?",
      [name.trim(), id]
    );

    if (existingCategories.length > 0) {
      return res.status(409).json({
        message: "Tên danh mục đã tồn tại",
      });
    }

    await pool.execute(
      "UPDATE categories SET name = ?, description = ? WHERE id = ?",
      [name.trim(), description || null, id]
    );

    return res.status(200).json({
      message: "Cập nhật danh mục thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi cập nhật danh mục",
      error: error.message,
    });
  }
};

// DELETE CATEGORY
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const [categories] = await pool.execute(
      "SELECT * FROM categories WHERE id = ?",
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy danh mục",
      });
    }

    await pool.execute("DELETE FROM categories WHERE id = ?", [id]);

    return res.status(200).json({
      message: "Xóa danh mục thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi xóa danh mục",
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};