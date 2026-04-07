const express = require("express");
const router = express.Router();

const {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductById,
  getProductsByCategoryId,
} = require("../controllers/productController");

const { verifyAccessToken } = require("../middlewares/authMiddleware");

router.get("/", getAllProducts);
router.get("/product/:id", getProductById);
router.get("/:categoryId", getProductsByCategoryId);
router.post("/", verifyAccessToken, createProduct);
router.put("/:id", verifyAccessToken, updateProduct);
router.delete("/:id", verifyAccessToken, deleteProduct);

module.exports = router;