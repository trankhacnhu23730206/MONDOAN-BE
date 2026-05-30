const pool = require("../config/db");
const OpenAI = require("openai");

const hasRealOpenAIKey =
  process.env.USE_AI === "true" &&
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== "sk-xxxxx";

const openai = hasRealOpenAIKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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

function getHistoryText(history = []) {
  if (!Array.isArray(history)) return "";

  return history
    .slice(-6)
    .map((item) => {
      if (typeof item === "string") return item;
      return item.content || item.message || item.text || "";
    })
    .join(" ");
}

function enrichMessageWithHistory(message, history = []) {
  if (detectCategory(message)) return message;

  const historyText = getHistoryText(history);
  return `${message} ${historyText}`;
}

function detectCategory(message) {
  const text = normalizeText(message);

  if (
    text.includes("laptop") ||
    text.includes("notebook") ||
    text.includes("may tinh xach tay")
  ) {
    return "Laptop";
  }

  if (
    text.includes("tai nghe") ||
    text.includes("headphone") ||
    text.includes("headset") ||
    text.includes("earbud") ||
    text.includes("earbuds")
  ) {
    return "Tai nghe";
  }

  if (
    text.includes("ban phim") ||
    text.includes("keyboard") ||
    text.includes("keycap") ||
    text.includes("switch")
  ) {
    return "Bàn phím";
  }

  if (
    text.includes("man hinh") ||
    text.includes("monitor") ||
    text.includes("display")
  ) {
    return "Màn hình";
  }

  if (
    /\bpc\b/.test(text) ||
    text.includes("may tinh ban") ||
    text.includes("desktop") ||
    text.includes("case pc")
  ) {
    return "PC";
  }

  if (
    text.includes("chuot") ||
    text.includes("mouse")
  ) {
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
    text.includes("khong qua") ||
    text.includes("toi da") ||
    text.includes("nho hon") ||
    text.includes("tro xuong") ||
    text.includes("do lai") ||
    text.includes("<= ")
  ) {
    return { maxPrice: amount };
  }

  if (
    text.includes("tren") ||
    text.includes("lon hon") ||
    text.includes("toi thieu") ||
    text.includes("tu ") ||
    text.includes(">= ")
  ) {
    return { minPrice: amount };
  }

  if (
    text.includes("khoang") ||
    text.includes("tam") ||
    text.includes("ngan sach") ||
    text.includes("gia tam") ||
    text.includes("gia khoang")
  ) {
    return {
      minPrice: Math.floor(amount * 0.8),
      maxPrice: Math.ceil(amount * 1.15),
    };
  }

  return { maxPrice: amount };
}

function detectSortIntent(message) {
  const text = normalizeText(message);

  if (
    text.includes("re nhat") ||
    text.includes("gia re nhat") ||
    text.includes("thap nhat") ||
    text.includes("it tien nhat") ||
    text.includes("mau re") ||
    text.includes("gia tot nhat")
  ) {
    return "CHEAPEST";
  }

  if (
    text.includes("dat nhat") ||
    text.includes("gia cao nhat") ||
    text.includes("cao cap nhat") ||
    text.includes("xin nhat") ||
    text.includes("manh nhat")
  ) {
    return "MOST_EXPENSIVE";
  }

  return "RECOMMEND";
}

function detectUseCases(message) {
  const text = normalizeText(message);
  const useCases = [];

  if (
    text.includes("gaming") ||
    text.includes("choi game") ||
    text.includes("game")
  ) {
    useCases.push("GAMING");
  }

  if (
    text.includes("van phong") ||
    text.includes("lam viec") ||
    text.includes("office")
  ) {
    useCases.push("OFFICE");
  }

  if (
    text.includes("hoc tap") ||
    text.includes("sinh vien") ||
    text.includes("di hoc")
  ) {
    useCases.push("STUDY");
  }

  if (
    text.includes("do hoa") ||
    text.includes("render") ||
    text.includes("edit video") ||
    text.includes("thiet ke")
  ) {
    useCases.push("GRAPHICS");
  }

  if (
    text.includes("khong day") ||
    text.includes("wireless") ||
    text.includes("bluetooth") ||
    text.includes("tws")
  ) {
    useCases.push("WIRELESS");
  }

  if (text.includes("rgb") || text.includes("led")) {
    useCases.push("RGB");
  }

  if (
    text.includes("ban phim co") ||
    text.includes("phim co") ||
    text.includes("mechanical")
  ) {
    useCases.push("MECHANICAL");
  }

  if (
    text.includes("co mic") ||
    text.includes("micro") ||
    text.includes("mic") ||
    text.includes("hoc online") ||
    text.includes("meeting")
  ) {
    useCases.push("MIC");
  }

  if (
    text.includes("go em") ||
    text.includes("em ai") ||
    text.includes("yen tinh")
  ) {
    useCases.push("QUIET");
  }

  return [...new Set(useCases)];
}

function detectBrand(message) {
  const text = normalizeText(message);

  const brands = [
    "acer",
    "asus",
    "hp",
    "lenovo",
    "logitech",
    "razer",
    "hyperx",
    "onikuma",
    "dareu",
    "keychron",
    "akko",
    "msi",
    "lg",
    "samsung",
    "aoc",
    "viewsonic",
  ];

  return brands.find((brand) => text.includes(brand)) || null;
}

function buildSearchTerms(message) {
  const text = normalizeText(message);
  const useCases = detectUseCases(message);
  const terms = [];

  if (useCases.includes("GAMING")) {
    terms.push(
      "gaming",
      "game",
      "nitro",
      "omen",
      "legion",
      "rog",
      "predator",
      "victus",
      "triton",
      "razer",
      "lightsync",
      "g102",
      "g502"
    );
  }

  if (useCases.includes("OFFICE")) {
    terms.push(
      "expertbook",
      "swift",
      "office",
      "van phong",
      "lift",
      "vertical"
    );
  }

  if (useCases.includes("STUDY")) {
    terms.push(
      "expertbook",
      "swift",
      "acer",
      "asus",
      "hoc tap",
      "sinh vien"
    );
  }

  if (useCases.includes("GRAPHICS")) {
    terms.push(
      "rog",
      "legion",
      "predator",
      "omen",
      "victus",
      "triton",
      "gaming"
    );
  }

  if (useCases.includes("WIRELESS")) {
    terms.push("wireless", "bluetooth", "tws", "khong day");
  }

  if (useCases.includes("RGB")) {
    terms.push("rgb", "lightsync", "rainbow", "led");
  }

  if (useCases.includes("MECHANICAL")) {
    terms.push("mechanical", "akko", "dareu", "keychron", "switch");
  }

  if (useCases.includes("MIC")) {
    terms.push("mic", "micro", "headset", "cloud", "earbuds");
  }

  if (useCases.includes("QUIET")) {
    terms.push("silent", "quiet", "em", "office");
  }

  const directTerms = [
    "g102",
    "g304",
    "g502",
    "rog",
    "omen",
    "legion",
    "nitro",
    "victus",
    "swift",
    "expertbook",
    "deathadder",
    "viper",
    "cloud",
    "earbuds",
    "tws",
    "bluetooth",
    "wireless",
    "rgb",
    "mechanical",
  ];

  for (const term of directTerms) {
    if (text.includes(term)) terms.push(term);
  }

  return [...new Set(terms)];
}

function buildOrderBy(sortIntent, searchTerms, orderParams) {
  if (sortIntent === "CHEAPEST") {
    return `
      CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,
      p.price ASC
    `;
  }

  if (sortIntent === "MOST_EXPENSIVE") {
    return `
      CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,
      p.price DESC
    `;
  }

  if (!searchTerms || searchTerms.length === 0) {
    return `
      CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,
      p.price ASC
    `;
  }

  const searchText = `
    LOWER(CONCAT_WS(' ',
      p.name,
      p.brand,
      p.sku,
      p.short_description,
      p.description,
      c.name
    ))
  `;

  const scoreParts = searchTerms.map(() => {
    orderParams.push("%" + searchTerms[orderParams.length] + "%");
    return `CASE WHEN ${searchText} LIKE ? THEN 10 ELSE 0 END`;
  });

  return `
    CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,
    (${scoreParts.join(" + ")}) DESC,
    p.price ASC
  `;
}

async function queryProducts(message, options = {}) {
  const categoryName = detectCategory(message);
  const sortIntent = detectSortIntent(message);
  const priceRange = extractPriceRange(message);
  const brand = detectBrand(message);
  const searchTerms = buildSearchTerms(message);

  const ignorePrice = options.ignorePrice === true;
  const ignoreBrand = options.ignoreBrand === true;

  const limit =
    sortIntent === "CHEAPEST" || sortIntent === "MOST_EXPENSIVE" ? 1 : 6;

  const where = ["p.status = 'active'"];
  const whereParams = [];

  if (categoryName) {
    where.push("c.name = ?");
    whereParams.push(categoryName);
  }

  if (brand && !ignoreBrand) {
    where.push(`
      (
        LOWER(p.name) LIKE ?
        OR LOWER(p.brand) LIKE ?
        OR LOWER(p.short_description) LIKE ?
        OR LOWER(p.description) LIKE ?
      )
    `);

    const brandLike = `%${brand}%`;
    whereParams.push(brandLike, brandLike, brandLike, brandLike);
  }

  if (!ignorePrice) {
    if (priceRange.minPrice !== undefined && priceRange.minPrice !== null) {
      where.push("p.price >= ?");
      whereParams.push(Number(priceRange.minPrice));
    }

    if (priceRange.maxPrice !== undefined && priceRange.maxPrice !== null) {
      where.push("p.price <= ?");
      whereParams.push(Number(priceRange.maxPrice));
    }
  }

  const orderParams = [];
  const orderBy = buildOrderBy(sortIntent, searchTerms, orderParams);

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
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;

  const params = [...whereParams, ...orderParams];

  console.log("===== CHATBOT QUERY =====");
  console.log("Message:", message);
  console.log("Category:", categoryName);
  console.log("Brand:", brand);
  console.log("Sort:", sortIntent);
  console.log("Price:", priceRange);
  console.log("Terms:", searchTerms);
  console.log("Params:", params);

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

async function findProducts(message) {
  let products = await queryProducts(message, {
    ignorePrice: false,
    ignoreBrand: false,
  });

  if (products.length > 0) return products;

  products = await queryProducts(message, {
    ignorePrice: true,
    ignoreBrand: false,
  });

  if (products.length > 0) return products;

  products = await queryProducts(message, {
    ignorePrice: true,
    ignoreBrand: true,
  });

  return products;
}

function buildProductContext(products) {
  if (!products || products.length === 0) {
    return "Không tìm thấy sản phẩm phù hợp trong database.";
  }

  return products
    .map((p, index) => {
      return `
${index + 1}.
Tên sản phẩm: ${p.name}
Danh mục: ${p.category_name || "Không rõ"}
Thương hiệu: ${p.brand || "Không rõ"}
SKU: ${p.sku || "Không có"}
Giá bán: ${formatMoney(p.price)}
Giá gốc/giá so sánh: ${p.compare_price ? formatMoney(p.compare_price) : "Không có"}
Tồn kho: ${p.stock}
Mô tả ngắn: ${p.short_description || "Không có"}
Mô tả: ${p.description || "Không có"}
Slug: ${p.slug || "Không có"}
Ảnh: ${p.image_url || "Không có"}
`;
    })
    .join("\n");
}

function buildFallbackAnswer(message, products) {
  const categoryName = detectCategory(message);
  const sortIntent = detectSortIntent(message);
  const priceRange = extractPriceRange(message);
  const brand = detectBrand(message);
  const useCases = detectUseCases(message);

  if (!products || products.length === 0) {
    return `Mình chưa tìm thấy sản phẩm phù hợp trong cửa hàng.

Bạn có thể hỏi rõ hơn, ví dụ:
- Chuột rẻ nhất shop
- Laptop gaming dưới 20 triệu
- Bàn phím RGB không dây
- Tai nghe Bluetooth dưới 1 triệu
- Màn hình dưới 5 triệu`;
  }

  const first = products[0];

  if (sortIntent === "CHEAPEST") {
    return `${categoryName || "Sản phẩm"} rẻ nhất hiện có trong shop là:

${first.name}
Giá: ${formatMoney(first.price)}
Tồn kho: ${first.stock} sản phẩm

Bạn có thể bấm vào sản phẩm bên dưới để xem chi tiết.`;
  }

  if (sortIntent === "MOST_EXPENSIVE") {
    return `${categoryName || "Sản phẩm"} cao cấp/giá cao nhất hiện có trong shop là:

${first.name}
Giá: ${formatMoney(first.price)}
Tồn kho: ${first.stock} sản phẩm

Mẫu này phù hợp nếu bạn ưu tiên cấu hình/hiệu năng hoặc phân khúc cao hơn.`;
  }

  const lines = products
    .slice(0, 3)
    .map((p, index) => {
      return `${index + 1}. ${p.name}
   Giá: ${formatMoney(p.price)}
   Tồn kho: ${p.stock} sản phẩm`;
    })
    .join("\n\n");

  let intro = "Dựa trên nhu cầu của bạn, mình gợi ý các sản phẩm sau:";

  if (categoryName) intro = `Với danh mục ${categoryName}, mình gợi ý cho bạn:`;
  if (brand) intro = `Với thương hiệu ${brand.toUpperCase()}, mình gợi ý cho bạn:`;
  if (useCases.includes("GAMING")) intro = "Nếu bạn cần sản phẩm để gaming, mình gợi ý:";
  if (useCases.includes("OFFICE")) intro = "Nếu bạn cần dùng văn phòng/làm việc, mình gợi ý:";
  if (useCases.includes("WIRELESS")) intro = "Nếu bạn cần sản phẩm không dây/Bluetooth, mình gợi ý:";

  return `${intro}

${lines}

Bạn có thể chọn theo ngân sách, tồn kho và nhu cầu sử dụng.`;
}

function buildPrompt(message, products, history = []) {
  const categoryName = detectCategory(message);
  const sortIntent = detectSortIntent(message);
  const priceRange = extractPriceRange(message);
  const brand = detectBrand(message);
  const useCases = detectUseCases(message);
  const productContext = buildProductContext(products);

  return `
Bạn là nhân viên tư vấn bán hàng cho website bán linh kiện/thiết bị điện tử.

Thông tin phân tích từ backend:
- Danh mục: ${categoryName || "Không xác định"}
- Ý định sắp xếp: ${sortIntent}
- Khoảng giá: ${JSON.stringify(priceRange)}
- Thương hiệu: ${brand || "Không có"}
- Nhu cầu sử dụng: ${useCases.join(", ") || "Tư vấn chung"}

Lịch sử chat gần đây:
${getHistoryText(history) || "Không có"}

Câu hỏi mới của khách:
"${message}"

Dữ liệu sản phẩm lấy trực tiếp từ MySQL:
${productContext}

Quy tắc trả lời:
- Trả lời bằng tiếng Việt, thân thiện, giống nhân viên tư vấn.
- Chỉ dùng sản phẩm trong dữ liệu MySQL được cung cấp.
- Không tự bịa giá, tồn kho, thông số kỹ thuật hoặc sản phẩm mới.
- Nếu khách hỏi "rẻ nhất", chỉ trả lời đúng 1 sản phẩm rẻ nhất.
- Nếu khách hỏi "đắt nhất", "cao cấp nhất", "mạnh nhất", chỉ trả lời đúng 1 sản phẩm giá cao nhất.
- Nếu khách hỏi dưới ngân sách, chỉ tư vấn các sản phẩm nằm trong ngân sách backend đã lọc.
- Nếu có nhiều sản phẩm phù hợp, gợi ý tối đa 3 sản phẩm.
- Mỗi sản phẩm nên nêu: tên, giá, tồn kho, lý do phù hợp.
- Nếu dữ liệu chưa đủ, nói rõ "mình chưa có đủ thông tin" và hỏi lại nhu cầu.
- Không nói lan man.
`;
}

async function generateAIAnswer(message, products, history = []) {
  if (!openai) {
    return buildFallbackAnswer(message, products);
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions:
        "Bạn là chatbot AI tư vấn bán hàng cho website laptop, PC, chuột, bàn phím, tai nghe, màn hình. Luôn tư vấn dựa trên dữ liệu sản phẩm backend cung cấp.",
      input: buildPrompt(message, products, history),
    });

    return response.output_text || buildFallbackAnswer(message, products);
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return buildFallbackAnswer(message, products);
  }
}

exports.chatWithAI = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập nội dung chat.",
      });
    }

    const enrichedMessage = enrichMessageWithHistory(message, history);
    const products = await findProducts(enrichedMessage);
    const answer = await generateAIAnswer(message, products, history);

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
        stock: p.stock,
      })),
      meta: {
        category: detectCategory(enrichedMessage),
        sortIntent: detectSortIntent(enrichedMessage),
        priceRange: extractPriceRange(enrichedMessage),
        brand: detectBrand(enrichedMessage),
        useCases: detectUseCases(enrichedMessage),
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