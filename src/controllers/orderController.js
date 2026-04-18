const pool = require("../config/db");

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const allowedPaymentMethods = ["COD", "BANK_TRANSFER", "VNPAY", "MOMO"];

const paymentMethodAliasMap = {
  COD: "COD",
  CASH_ON_DELIVERY: "COD",
  BANK_TRANSFER: "BANK_TRANSFER",
  BANK_CARD: "BANK_TRANSFER",
  MASTERCARD: "BANK_TRANSFER",
  CARD: "BANK_TRANSFER",
  VNPAY: "VNPAY",
  MOMO: "MOMO",
};

let paymentStatusEnumCache = null;

const getOrderPaymentStatusEnumValues = async () => {
  if (paymentStatusEnumCache) return paymentStatusEnumCache;

  const [rows] = await pool.execute(
    "SHOW COLUMNS FROM orders LIKE 'payment_status'"
  );

  if (!rows.length) {
    paymentStatusEnumCache = ["pending"];
    return paymentStatusEnumCache;
  }

  const type = String(rows[0].Type || "");
  const values = [...type.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  paymentStatusEnumCache = values.length ? values : ["pending"];
  return paymentStatusEnumCache;
};

const resolveInitialPaymentStatus = (paymentMethod, allowedStatuses) => {
  const pick = (candidates) =>
    candidates.find((status) => allowedStatuses.includes(status));

  if (paymentMethod === "COD") {
    return pick(["unpaid", "pending", "created"]) || allowedStatuses[0] || "pending";
  }

  return pick(["pending", "unpaid", "created"]) || allowedStatuses[0] || "pending";
};

const buildOrderCode = () => {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `ORD${timestamp}${randomSuffix}`.slice(0, 30);
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const nestedValue = (object, path) => {
  return path.split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, object);
};

const normalizePaymentMethod = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const key = normalized.toUpperCase().replace(/\s+/g, "_");
  return paymentMethodAliasMap[key] || null;
};

const normalizeAddressPayload = (body) => {
  const shippingFullName = normalizeText(
    firstDefined(
      body.shipping_full_name,
      body.shippingFullName,
      body.shipping_name,
      body.shippingName,
      body.full_name,
      body.fullName,
      body["shipping_full name"],
      body["shipping full name"],
      body["receiver name"],
      body.receiver_name,
      body.receiverName,
      body.name,
      nestedValue(body, "shippingInfo.name"),
      nestedValue(body, "contactInfo.name")
    )
  );
  const shippingPhone = normalizeText(
    firstDefined(
      body.shipping_phone,
      body.shippingPhone,
      body.shipping_mobile,
      body.shippingMobile,
      body["shipping phone"],
      body.receiver_phone,
      body.receiverPhone,
      body.phone,
      nestedValue(body, "shippingInfo.phone"),
      nestedValue(body, "contactInfo.phone")
    )
  );
  const shippingAddressLine1 = normalizeText(
    firstDefined(
      body.shipping_address_line1,
      body.shippingAddressLine1,
      body["shipping_address line1"],
      body["shipping address line1"],
      body.shipping_address,
      body.shippingAddress,
      body.address,
      nestedValue(body, "shippingInfo.address")
    )
  );
  const shippingAddressLine2 = normalizeText(
    firstDefined(
      body.shipping_address_line2,
      body.shippingAddressLine2,
      body["shipping address line2"],
      body.address_line2,
      body.addressLine2
    )
  );
  const shippingWard = normalizeText(
    firstDefined(
      body.shipping_ward,
      body.shippingWard,
      body.ward,
      nestedValue(body, "shippingInfo.ward")
    )
  );
  const shippingDistrict = normalizeText(
    firstDefined(
      body.shipping_district,
      body.shippingDistrict,
      body.district,
      nestedValue(body, "shippingInfo.district")
    )
  );
  const shippingCity = normalizeText(
    firstDefined(
      body.shipping_city,
      body.shippingCity,
      body.city,
      nestedValue(body, "shippingInfo.city")
    )
  );
  const shippingCountry = normalizeText(
    firstDefined(
      body.shipping_country,
      body.shippingCountry,
      body.country,
      nestedValue(body, "shippingInfo.country")
    )
  ) || "Viet Nam";
  const note = normalizeText(firstDefined(body.note, nestedValue(body, "shippingInfo.note")));

  return {
    shippingFullName,
    shippingPhone,
    shippingAddressLine1,
    shippingAddressLine2,
    shippingWard,
    shippingDistrict,
    shippingCity,
    shippingCountry,
    note,
  };
};

const mapOrderRow = (order) => ({
  ...order,
  receiver_name: order.shipping_full_name,
  receiver_phone: order.shipping_phone,
  shipping_address: [
    order.shipping_address_line1,
    order.shipping_address_line2,
    order.shipping_ward,
    order.shipping_district,
    order.shipping_city,
    order.shipping_country,
  ]
    .filter(Boolean)
    .join(", "),
  status: order.order_status,
});

const mapOrderItemRow = (item) => ({
  ...item,
  product_price: Number(item.unit_price),
  subtotal: Number(item.line_total),
});

// POST /api/orders
const createOrder = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    console.log("[createOrder] content-type:", req.headers["content-type"]);
    console.log("[createOrder] body:", JSON.stringify(req.body, null, 2));

    const items = firstDefined(req.body.items, req.body.order_items, req.body.orderItems);
    const rawPaymentMethod = firstDefined(
      req.body.payment_method,
      req.body.paymentMethod,
      nestedValue(req.body, "payment.method")
    );
    const payment_method = normalizePaymentMethod(rawPaymentMethod || "COD");
    const {
      shippingFullName,
      shippingPhone,
      shippingAddressLine1,
      shippingAddressLine2,
      shippingWard,
      shippingDistrict,
      shippingCity,
      shippingCountry,
      note,
    } = normalizeAddressPayload(req.body);

    const shippingFee = Number(
      firstDefined(req.body.shipping_fee, req.body.shippingFee, req.body.shipping) || 0
    );
    const discountAmount = Number(
      firstDefined(req.body.discount_amount, req.body.discountAmount, req.body.discount) || 0
    );

    if (!req.user || !req.user.id) {
      fail(401, "Bạn cần đăng nhập để tạo đơn hàng");
    }

    if (!shippingFullName) fail(400, "Vui lòng nhập tên người nhận");
    if (!shippingPhone) fail(400, "Vui lòng nhập số điện thoại người nhận");
    if (!shippingAddressLine1) fail(400, "Vui lòng nhập địa chỉ giao hàng");
    if (!Array.isArray(items) || items.length === 0) {
      fail(400, "Danh sách sản phẩm không hợp lệ");
    }
    if (!allowedPaymentMethods.includes(payment_method)) {
      fail(400, "Phương thức thanh toán không hợp lệ");
    }
    if (Number.isNaN(shippingFee) || shippingFee < 0) {
      fail(400, "Phí vận chuyển không hợp lệ");
    }
    if (Number.isNaN(discountAmount) || discountAmount < 0) {
      fail(400, "Giảm giá không hợp lệ");
    }

    await connection.beginTransaction();

    let subtotalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const productId = Number(firstDefined(item.product_id, item.productId, item.id));
      const quantity = Number(firstDefined(item.quantity, item.qty, item.count));

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        fail(400, "product_id hoặc quantity không hợp lệ");
      }

      const [products] = await connection.execute(
        "SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );

      if (products.length === 0) {
        fail(404, `Sản phẩm ${productId} không tồn tại`);
      }

      const product = products[0];

      if (Number(product.stock) < quantity) {
        fail(400, `Sản phẩm ${product.name} không đủ tồn kho`);
      }

      const price = Number(product.price);
      const lineTotal = Number((price * quantity).toFixed(2));
      subtotalAmount += lineTotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        product_sku: normalizeText(item.product_sku) || `PRODUCT-${product.id}`,
        unit_price: price,
        quantity,
        line_total: lineTotal,
      });
    }

    subtotalAmount = Number(subtotalAmount.toFixed(2));
    const totalAmount = Number(
      Math.max(subtotalAmount + shippingFee - discountAmount, 0).toFixed(2)
    );
    const paymentStatus = resolveInitialPaymentStatus(
      payment_method,
      await getOrderPaymentStatusEnumValues()
    );
    const orderStatus = "pending";
    const orderCode = buildOrderCode();

    const [orderResult] = await connection.execute(
      `INSERT INTO orders
      (
        order_code,
        user_id,
        shipping_full_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_ward,
        shipping_district,
        shipping_city,
        shipping_country,
        note,
        subtotal,
        shipping_fee,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        order_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderCode,
        req.user.id,
        shippingFullName,
        shippingPhone,
        shippingAddressLine1,
        shippingAddressLine2,
        shippingWard,
        shippingDistrict,
        shippingCity,
        shippingCountry,
        note,
        subtotalAmount,
        shippingFee,
        discountAmount,
        totalAmount,
        payment_method,
        paymentStatus,
        orderStatus,
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
        (order_id, product_id, product_name, product_sku, unit_price, quantity, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.unit_price,
          item.quantity,
          item.line_total,
        ]
      );

      await connection.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await connection.execute(
      `INSERT INTO payments (order_id, provider, amount, status)
       VALUES (?, ?, ?, 'pending')`,
      [orderId, payment_method, totalAmount]
    );

    await connection.commit();

    return res.status(201).json({
      message: "Tạo đơn hàng thành công",
      order: mapOrderRow({
        id: orderId,
        order_code: orderCode,
        user_id: req.user.id,
        shipping_full_name: shippingFullName,
        shipping_phone: shippingPhone,
        shipping_address_line1: shippingAddressLine1,
        shipping_address_line2: shippingAddressLine2,
        shipping_ward: shippingWard,
        shipping_district: shippingDistrict,
        shipping_city: shippingCity,
        shipping_country: shippingCountry,
        note,
        subtotal: subtotalAmount,
        shipping_fee: shippingFee,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        order_status: orderStatus,
        payment_method,
        payment_status: paymentStatus,
        items: orderItems.map(mapOrderItemRow),
      }),
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi tạo đơn hàng",
    });
  } finally {
    connection.release();
  }
};

// GET /api/orders/my-orders
const getMyOrders = async (req, res) => {
  try {
    const [orders] = await pool.execute(
      `SELECT
        id,
        order_code,
        user_id,
        shipping_full_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_ward,
        shipping_district,
        shipping_city,
        shipping_country,
        note,
        subtotal,
        shipping_fee,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        created_at,
        updated_at
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      message: "Lấy danh sách đơn hàng thành công",
      orders: orders.map(mapOrderRow),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách đơn hàng",
      error: error.message,
    });
  }
};

// GET /api/orders/:id
const getMyOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders] = await pool.execute(
      `SELECT
        id,
        order_code,
        user_id,
        shipping_full_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_ward,
        shipping_district,
        shipping_city,
        shipping_country,
        note,
        subtotal,
        shipping_fee,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        created_at,
        updated_at
      FROM orders
      WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const [items] = await pool.execute(
      `SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.product_name,
        oi.product_sku,
        oi.unit_price,
        oi.quantity,
        oi.line_total,
        p.thumbnail_url
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC`,
      [id]
    );

    return res.status(200).json({
      message: "Lấy chi tiết đơn hàng thành công",
      order: {
        ...mapOrderRow(orders[0]),
        items: items.map(mapOrderItemRow),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy chi tiết đơn hàng",
      error: error.message,
    });
  }
};

// PATCH /api/orders/:id/cancel
const cancelMyOrder = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    const [orders] = await connection.execute(
      "SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, req.user.id]
    );

    if (orders.length === 0) fail(404, "Không tìm thấy đơn hàng");

    const order = orders[0];

    if (["shipping", "delivered", "cancelled"].includes(order.order_status)) {
      fail(400, "Đơn hàng không thể hủy ở trạng thái hiện tại");
    }

    if (order.payment_status === "paid") {
      fail(400, "Đơn hàng đã thanh toán, cần xử lý hoàn tiền riêng");
    }

    const [items] = await connection.execute(
      "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
      [id]
    );

    for (const item of items) {
      await connection.execute(
        "UPDATE products SET stock = stock + ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await connection.execute(
      `UPDATE orders
       SET order_status = 'cancelled', payment_status = 'failed'
       WHERE id = ?`,
      [id]
    );

    await connection.execute(
      `UPDATE payments
       SET status = 'failed'
       WHERE order_id = ? AND status = 'pending'`,
      [id]
    );

    await connection.commit();

    return res.status(200).json({
      message: "Hủy đơn hàng thành công",
    });
  } catch (error) {
    await connection.rollback();
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi server khi hủy đơn hàng",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
};