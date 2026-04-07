const express = require("express");
const router = express.Router();

const { verifyAccessToken } = require("../middlewares/authMiddleware");
const {
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
} = require("../controllers/orderController");

router.use(verifyAccessToken);

router.post("/", createOrder);
router.get("/my-orders", getMyOrders);
router.get("/:id", getMyOrderById);
router.patch("/:id/cancel", cancelMyOrder);

module.exports = router;

// {
//   "receiver_name": "Tran Khac Nhu",
//   "receiver_phone": "0909123456",
//   "shipping_address": "123 Nguyen Trai, Q1, TP.HCM",
//   "note": "Giao giờ hành chính",
//   "payment_method": "COD",
//   "items": [
//     { "product_id": 1, "quantity": 2 },
//     { "product_id": 3, "quantity": 1 }
//   ]
// }