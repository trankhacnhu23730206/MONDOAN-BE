const express = require("express");
const router = express.Router();

const { verifyAccessToken } = require("../middlewares/authMiddleware");
const {
  confirmPayment,
  getMyPayments,
  getMyPaymentByOrderId,
} = require("../controllers/paymentController");

router.use(verifyAccessToken);

router.get("/", getMyPayments);
router.get("/order/:orderId", getMyPaymentByOrderId);
router.post("/order/:orderId/confirm", confirmPayment);

// POST /api/payments/order/1/confirm
// {
//   "transaction_code": "TXN_20260331_001",
//   "provider_response": {
//     "gateway": "demo",
//     "message": "paid success"
//   }
// }

module.exports = router;