const express = require("express");
const router = express.Router();

const { verifyAccessToken } = require("../middlewares/authMiddleware");
const {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
} = require("../controllers/cartController");

router.use(verifyAccessToken);

router.post("/", addToCart);
router.get("/", getCart);
router.patch("/:itemId", updateCartItem);
router.delete("/:itemId", removeCartItem);

module.exports = router;
