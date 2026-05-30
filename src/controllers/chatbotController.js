const pool = require("../config/db");
const OpenAI = require("openai");

const hasRealOpenAIKey =
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== "sk-xxxxx" &&
  process.env.USE_AI === "true";

const openai = hasRealOpenAIKey
  ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  : null;

function normalizeText(text = "") {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function formatMoney(value) {
  if (value === null || value === undefined) return "Chưa có giá";
  return Number(value).toLocaleString("vi-VN") + "đ";
}

function detectCategory(message) {
  const text = normalizeText(message);

  if (text.includes("laptop") || text.includes("may tinh xach tay")) {
    return "Laptop";
  }

  if (
    text.includes("tai nghe") ||
    text.includes("headphone") ||
    text.includes("headset") ||
    text.includes("earbud")
  ) {
    return "Tai nghe";
  }

  if (text.includes("ban phim") || text.includes("keyboard")) {
    return "Bàn phím";
  }

  if (text.includes("man hinh") || text.includes("monitor")) {
    return "Màn hình";
  }

  if (text.includes("pc") || text.includes("may tinh ban") || text.includes("desktop")) {
    return "PC";
  }

  if (text.includes("chuot") || text.includes("mouse")) {
    return "Chuột";
  }

  return null;
}

function extractPriceRange(message) {
  const text = normalizeText(message);

  let amount = null;

  const trieuMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(trieu|tr|m)\b/);
  const nghinMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(nghin|ngan|k)\b/);
  const vndMatch = text.match(/(\d{6,})\s*(vnd|d|đ)?/);

  if (trieuMatch) {
    amount = Number(trieuMatch[1].replace(",", ".")) * 1000000;
  } else if (nghinMatch) {
    amount = Number(nghinMatch[1].replace(",", ".")) * 1000;
  } else if (vndMatch) {
    amount = Number(vndMatch[1]);
  }

  if (!amount || Number.isNaN(amount)) return {};

  if (
    text.includes("duoi") ||
    text.includes("dưới") ||
    text.includes("toi da") ||
    text.includes("tối đa") ||
    text.includes("khong qua") ||
    text.includes("không quá")
  ) {
    return { maxPrice: amount };
  }

  if (
    text.includes("tren") ||
    text.includes("trên") ||
    text.includes("toi thieu") ||
    text.includes("tối thiểu")
  ) {
    return { minPrice: amount };
  }

  if (
    text.includes("khoang") ||
    text.includes("khoảng") ||
    text.includes("tam") ||
    text.includes("tầm") ||
    text.includes("ngan sach") ||
    text.includes("ngân sách")
  ) {
    return {
      minPrice: Math.floor(amount * 0.8),
      maxPrice: Math.ceil(amount * 1.15),
    };
  }

  return { maxPrice: amount };
}

function extractSearchTerms(message) {
  const text = normalizeText(message);

  const map = [
    ["gaming", "gaming"],
    ["game", "gaming"],
    ["choi game", "gaming"],
    ["van phong", "văn phòng"],
    ["hoc tap", "học tập"],
    ["do hoa", "đồ họa"],
    ["rgb", "rgb"],
    ["bluetooth", "bluetooth"],
    ["khong day", "wireless"],
    ["wireless", "wireless"],

    ["acer", "acer"],
    ["asus", "asus"],
    ["hp", "hp"],
    ["lenovo", "lenovo"],
    ["logitech", "logitech"],
    ["razer", "razer"],
    ["hyperx", "hyperx"],
    ["onikuma", "onikuma"],

    ["nitro", "nitro"],
    ["omen", "omen"],
    ["legion", "legion"],
    ["rog", "rog"],
    ["swift", "swift"],
    ["g102", "g102"],
    ["g502", "g502"],
  ];

  const terms = [];

  for (const [keyword, value] of map) {
    if (text.includes(keyword)) {
      terms.push(value);
    }
  }

  return [...new Set(terms)];
}

async function queryProducts(message, limit = 6, options = {}) {
  const categoryName = detectCategory(message);
  const terms = extractSearchTerms(message);
  const priceRange = extractPriceRange(message);

  const ignorePrice = options.ignorePrice === true;
  const ignoreTerms = options.ignoreTerms === true;

  const safeLimit = Number.isInteger(Number(limit)) ? Number(limit) : 6;

  const where = ["p.status = 'active'"];
  const params = [];

  if (categoryName) {
    where.push("c.name = ?");
    params.push(categoryName);
  }

  if (!ignoreTerms && terms.length > 0) {
    const termConditions = [];

    for (const term of terms) {
      termConditions.push(`
        (
          p.name LIKE ?
          OR p.brand LIKE ?
          OR p.sku LIKE ?
          OR p.short_description LIKE ?
          OR p.description LIKE ?
          OR c.name LIKE ?
        )
      `);

      const likeTerm = `%${term}%`;
      params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
    }

    where.push(`(${termConditions.join(" OR ")})`);
  }

  if (!ignorePrice) {
    if (priceRange.minPrice !== undefined && priceRange.minPrice !== null) {
      where.push("p.price >= ?");
      params.push(Number(priceRange.minPrice));
    }

    if (priceRange.maxPrice !== undefined && priceRange.maxPrice !== null) {
      where.push("p.price <= ?");
      params.push(Number(priceRange.maxPrice));
    }
  }

  const sql = `
    SELECT
      p.id,
      p.category_id,
      p.name,
      p.slug,
      p.sku,
      p.brand,
      p.short_description,
      p.description,
      p.price,
      p.compare_price,
      p.stock,
      p.thumbnail_url,
      p.status,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,
      p.price ASC
    LIMIT ${safeLimit}
  `;

  console.log("===== CHATBOT SQL =====");
  console.log(sql);
  console.log("PARAMS:", params);

  const [rows] = await pool.query(sql, params);

  return rows.map((p) => ({
    id: p.id,
    category_id: p.category_id,
    category_name: p.category_name,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    brand: p.brand,
    short_description: p.short_description,
    description: p.description,
    price: p.price ? Number(p.price) : 0,
    compare_price: p.compare_price ? Number(p.compare_price) : null,
    stock: p.stock,
    image_url: p.thumbnail_url,
    status: p.status,
  }));
}

function buildFallbackAnswer(message, products) {
  if (!products || products.length === 0) {
    return "Mình chưa tìm thấy sản phẩm phù hợp trong cửa hàng. Bạn có thể nói rõ hơn nhu cầu như: laptop gaming dưới 20 triệu, chuột không dây, bàn phím RGB, màn hình dưới 5 triệu...";
  }

  const productLines = products
    .slice(0, 3)
    .map((p, index) => {
      return `${index + 1}. ${p.name} - ${formatMoney(p.price)} - còn ${p.stock
        } sản phẩm`;
    })
    .join("\n");

  return `Dựa trên dữ liệu sản phẩm hiện có, mình gợi ý cho bạn:\n\n${productLines}\n\nBạn có thể xem chi tiết sản phẩm để chọn mẫu phù hợp hơn.`;
}

function buildProductContext(products) {
  if (!products || products.length === 0) {
    return "Không tìm thấy sản phẩm phù hợp trong database.";
  }

  return products
    .slice(0, 6)
    .map((p, index) => {
      return `
${index + 1}.
Tên sản phẩm: ${p.name}
Danh mục: ${p.category_name || "Không rõ"}
Thương hiệu: ${p.brand || "Không rõ"}
Giá: ${formatMoney(p.price)}
Giá gốc: ${p.compare_price ? formatMoney(p.compare_price) : "Không có"}
Tồn kho: ${p.stock}
Mô tả ngắn: ${p.short_description || "Không có"}
Mô tả: ${p.description || "Không có"}
`;
    })
    .join("\n");
}

async function generateAIAnswer(message, products) {
  if (!openai) {
    return buildFallbackAnswer(message, products);
  }

  try {
    const productContext = buildProductContext(products);

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions:
        "Bạn là chatbot tư vấn sản phẩm cho website bán laptop, PC, chuột, bàn phím, tai nghe, màn hình. Chỉ được tư vấn dựa trên dữ liệu sản phẩm backend cung cấp. Không bịa giá, tồn kho hoặc thông số.",
      input: `
Câu hỏi khách hàng:
${message}

Dữ liệu sản phẩm từ MySQL:
${productContext}

Yêu cầu:
- Trả lời bằng tiếng Việt.
- Tư vấn ngắn gọn, thân thiện.
- Nếu có sản phẩm phù hợp, gợi ý tối đa 3 sản phẩm.
- Luôn nêu giá và tồn kho nếu có.
- Nếu không có sản phẩm phù hợp, hãy hỏi lại nhu cầu.
`,
    });

    return response.output_text || buildFallbackAnswer(message, products);
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return buildFallbackAnswer(message, products);
  }
}

exports.chatWithAI = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nội dung chat.",
      });
    }

    let products = await queryProducts(message, 6, {
      ignorePrice: false,
      ignoreTerms: false,
    });

    if (products.length === 0) {
      products = await queryProducts(message, 6, {
        ignorePrice: true,
        ignoreTerms: false,
      });
    }

    if (products.length === 0) {
      products = await queryProducts(message, 6, {
        ignorePrice: true,
        ignoreTerms: true,
      });
    }

    const answer = await generateAIAnswer(message, products);

    return res.json({
      success: true,
      answer,
      reply: answer,
      products,
      suggestions: products.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
        slug: p.slug,
      })),
      meta: {
        category: detectCategory(message),
        priceRange: extractPriceRange(message),
        terms: extractSearchTerms(message),
        totalProducts: products.length,
        aiEnabled: Boolean(openai),
      },
    });
  } catch (error) {
    console.error("Chatbot error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xử lý chatbot.",
      error: error.message,
    });
  }
};

exports.getChatbotHealth = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS total FROM products WHERE status = 'active'"
    );

    return res.json({
      success: true,
      message: "Chatbot API đang hoạt động.",
      totalActiveProducts: rows[0].total,
      aiEnabled: Boolean(openai),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Không kết nối được database.",
      error: error.message,
    });
  }
};