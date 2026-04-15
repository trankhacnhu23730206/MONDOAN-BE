const express = require("express");
const router = express.Router();

const {
  register,
  login,
  refreshAccessToken,
  getMe,
  updateMe,
  logout,
} = require("../controllers/authController");

const { verifyAccessToken } = require("../middlewares/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", verifyAccessToken, getMe);
router.put("/me", verifyAccessToken, updateMe);

module.exports = router;