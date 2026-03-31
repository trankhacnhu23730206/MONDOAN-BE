const express = require("express");
const router = express.Router();

const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

const { verifyAccessToken } = require("../middlewares/authMiddleware");

router.get("/", getAllCategories);
router.get("/:id", getCategoryById);
router.post("/", verifyAccessToken, createCategory);
router.put("/:id", verifyAccessToken, updateCategory);
router.delete("/:id", verifyAccessToken, deleteCategory);

module.exports = router;