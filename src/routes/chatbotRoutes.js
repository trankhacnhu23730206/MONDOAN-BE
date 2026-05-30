const express = require("express");
const router = express.Router();

const {
    chatWithAI,
    getChatbotHealth,
} = require("../controllers/chatbotController");

router.get("/health", getChatbotHealth);

// Route chính FE đang gọi:
router.post("/", chatWithAI);

// Route phụ, để nếu FE cũ còn gọi /ask thì vẫn chạy:
router.post("/ask", chatWithAI);

module.exports = router;