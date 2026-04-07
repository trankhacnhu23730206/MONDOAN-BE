const pool = require("../config/db");

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

// POST /api/payments/order/:orderId/confirm
// Dùng cho BANK_TRANSFER / VNPAY / MOMO ở mức demo hoặc callback nội bộ
const confirmPayment = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { orderId } = req.params;
    const { transaction_code, provider_response } = req.body;

    await connection.beginTransaction();

    const [orders] = await connection.execute(
      "SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [orderId, req.user.id]
    );

    if (orders.length === 0) fail(404, "Không tìm thấy đơn hàng");

    const order = orders[0];

    if (order.status === "cancelled") {
      fail(400, "Đơn hàng đã bị hủy");
    }

    if (order.payment_method === "COD") {
      fail(400, "Đơn COD không xác nhận thanh toán tại endpoint này");
    }

    if (order.payment_status === "paid") {
      fail(400, "Đơn hàng đã được thanh toán");
    }

    const [payments] = await connection.execute(
      "SELECT id FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1",
      [orderId]
    );

    const providerResponseText = provider_response
      ? JSON.stringify(provider_response)
      : null;

    if (payments.length === 0) {
      await connection.execute(
        `INSERT INTO payments
        (order_id, user_id, method, amount, status, transaction_code, provider_response, paid_at)
        VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW())`,
        [
          order.id,
          req.user.id,
          order.payment_method,
          Number(order.total_amount),
          transaction_code || null,
          providerResponseText,
        ]
      );
    } else {
      await connection.execute(
        `UPDATE payments
         SET status = 'paid',
             transaction_code = ?,
             provider_response = ?,
             paid_at = NOW()
         WHERE id = ?`,
        [
          transaction_code || null,
          providerResponseText,
          payments[0].id,
        ]
      );
    }

    await connection.execute(
      "UPDATE orders SET payment_status = 'paid' WHERE id = ?",
      [orderId]
    );

    await connection.commit();

    return res.status(200).json({
      message: "Xác nhận thanh toán thành công",
      payment: {
        order_id: Number(orderId),
        payment_status: "paid",
        transaction_code: transaction_code || null,
      },
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi xác nhận thanh toán",
    });
  } finally {
    connection.release();
  }
};

// GET /api/payments
const getMyPayments = async (req, res) => {
  try {
    const [payments] = await pool.execute(
      `SELECT
        p.id,
        p.order_id,
        p.method,
        p.amount,
        p.status,
        p.transaction_code,
        p.paid_at,
        p.created_at,
        p.updated_at,
        o.status AS order_status,
        o.payment_status
      FROM payments p
      INNER JOIN orders o ON o.id = p.order_id
      WHERE p.user_id = ?
      ORDER BY p.id DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      message: "Lấy danh sách thanh toán thành công",
      payments,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách thanh toán",
      error: error.message,
    });
  }
};

// GET /api/payments/order/:orderId
const getMyPaymentByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const [payments] = await pool.execute(
      `SELECT
        p.id,
        p.order_id,
        p.method,
        p.amount,
        p.status,
        p.transaction_code,
        p.provider_response,
        p.paid_at,
        p.created_at,
        p.updated_at
      FROM payments p
      INNER JOIN orders o ON o.id = p.order_id
      WHERE p.order_id = ? AND o.user_id = ?
      ORDER BY p.id DESC`,
      [orderId, req.user.id]
    );

    return res.status(200).json({
      message: "Lấy thông tin thanh toán thành công",
      payments,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy thông tin thanh toán",
      error: error.message,
    });
  }
};

module.exports = {
  confirmPayment,
  getMyPayments,
  getMyPaymentByOrderId,
};