const jwt = require("jsonwebtoken");

const verifyAccessToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Không tìm thấy access token",
      });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          message: "Access token không hợp lệ hoặc đã hết hạn",
        });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi xác thực token",
      error: error.message,
    });
  }
};

const verifyAdmin = (req, res, next) => {
  verifyAccessToken(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        message: "Bạn không có quyền thực hiện hành động này (chỉ dành cho admin)",
      });
    }
    next();
  });
};

module.exports = {
  verifyAccessToken,
  verifyAdmin,
};