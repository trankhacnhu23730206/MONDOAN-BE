const FALLBACK_REPLY =
  "He thong chatbot AI tam thoi chua san sang. Ban thu lai sau hoac lien he ho tro.";

const buildPayloadMessages = (history = [], latestMessage = "") => {
  const systemPrompt = {
    role: "system",
    content:
      "Ban la tro ly tu van ban hang cho cua hang cong nghe. Tra loi bang tieng Viet, gon gang, lich su va huu ich. Neu khach hoi ve chinh sach, hay khuyen lien he ho tro neu khong co du lieu chac chan.",
  };

  const recentHistory = Array.isArray(history)
    ? history
        .slice(-10)
        .filter((item) => item && typeof item.content === "string" && item.content.trim())
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content.trim(),
        }))
    : [];

  return [
    systemPrompt,
    ...recentHistory,
    {
      role: "user",
      content: latestMessage,
    },
  ];
};

const askChatbot = async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        message: "Vui long nhap noi dung cau hoi",
      });
    }

    const cleanedMessage = String(message).trim();
    const suggestions = [];

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return res.status(200).json({
        reply: FALLBACK_REPLY,
        source: "fallback",
        suggestions,
      });
    }

    const payload = {
      model,
      messages: buildPayloadMessages(history, cleanedMessage),
      temperature: 0.4,
      max_tokens: 400,
    };

    if (typeof fetch !== "function") {
      return res.status(200).json({
        reply: FALLBACK_REPLY,
        source: "fallback",
        message: "Server khong ho tro fetch",
        suggestions,
      });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return res.status(200).json({
        reply: FALLBACK_REPLY,
        source: "fallback",
        message: "OpenAI request failed",
        suggestions,
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return res.status(200).json({
      reply: reply || FALLBACK_REPLY,
      source: "ai",
      suggestions,
    });
  } catch (error) {
    return res.status(200).json({
      reply: FALLBACK_REPLY,
      source: "fallback",
      message: "Khong the ket noi AI luc nay",
      error: error.message,
      suggestions: [],
    });
  }
};

module.exports = {
  askChatbot,
};
