const express = require("express");
const router = express.Router();

const {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductsByCategoryId,
} = require("../controllers/productController");

const { verifyAccessToken } = require("../middlewares/authMiddleware");

router.get("/", getAllProducts);
router.get("/:categoryId", getProductsByCategoryId);
router.post("/", verifyAccessToken, createProduct);
router.put("/:id", verifyAccessToken, updateProduct);
router.delete("/:id", verifyAccessToken, deleteProduct);

module.exports = router;