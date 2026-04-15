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
//   "shipping_full_name": "Tran Khac Nhu",
//   "shipping_phone": "0909123456",
//   "shipping_address_line1": "123 Nguyen Trai",
//   "shipping_address_line2": "Tang 5",
//   "shipping_ward": "Ben Thanh",
//   "shipping_district": "Quan 1",
//   "shipping_city": "TP.HCM",
//   "shipping_country": "Viet Nam",
//   "note": "Giao gio hanh chinh",
//   "payment_method": "COD",
//   "shipping_fee": 0,
//   "discount_amount": 0,
//   "items": [
//     { "product_id": 1, "quantity": 2 },
//     { "product_id": 3, "quantity": 1 }
//   ]
// }