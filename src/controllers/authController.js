const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/token");

// REGISTER
const register = async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập username và password",
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        message: "Username phải có ít nhất 3 ký tự",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password phải có ít nhất 6 ký tự",
      });
    }

     if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        message: "Vui lòng nhập email hợp lệ",
      });
    }

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE user_name = ?",
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Username đã tồn tại",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      "INSERT INTO users (user_name, password_hash, email) VALUES (?, ?, ?)",
      [username, hashedPassword, email]
    );

    const newUser = {
      id: result.insertId,
      username,
    };

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [
      refreshToken,
      newUser.id,
    ]);

    return res.status(201).json({
      message: "Đăng ký user thành công",
      user: newUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi đăng ký",
      error: error.message,
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập username và password",
      });
    }

    const [users] = await pool.execute("SELECT * FROM users WHERE user_name = ?", [
      username
    ]);

    if (users.length === 0) {
      return res.status(401).json({
        message: "Sai username hoặc password",
      });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "Sai username hoặc password",
      });
    }

    const payloadUser = {
      id: user.id,
      username: user.user_name,
    };


    const accessToken = generateAccessToken(payloadUser);
    const refreshToken = generateRefreshToken(payloadUser);

    await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [
      refreshToken,
      user.id,
    ]);

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: payloadUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi đăng nhập",
      error: error.message,
    });
  }
};

// REFRESH TOKEN
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Không có refresh token",
      });
    }

    const [users] = await pool.execute(
      "SELECT * FROM users WHERE refresh_token = ?",
      [refreshToken]
    );

    if (users.length === 0) {
      return res.status(403).json({
        message: "Refresh token không hợp lệ",
      });
    }

    const userInDb = users[0];

    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET,
      async (err, decoded) => {
        if (err) {
          return res.status(403).json({
            message: "Refresh token hết hạn hoặc không hợp lệ",
          });
        }

        const payloadUser = {
          id: userInDb.id,
          username: userInDb.username,
        };

        const newAccessToken = generateAccessToken(payloadUser);
        const newRefreshToken = generateRefreshToken(payloadUser);

        await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [
          newRefreshToken,
          userInDb.id,
        ]);

        return res.status(200).json({
          message: "Refresh token thành công",
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      }
    );
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi refresh token",
      error: error.message,
    });
  }
};

// PROFILE / ME
const getMe = async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, user_name, created_at, updated_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy user",
      });
    }

    return res.status(200).json({
      message: "Lấy thông tin user thành công",
      user: users[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy profile",
      error: error.message,
    });
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        message: "Thiếu refresh token",
      });
    }

    const [users] = await pool.execute(
      "SELECT id FROM users WHERE refresh_token = ?",
      [refreshToken]
    );

    if (users.length === 0) {
      return res.status(200).json({
        message: "Đăng xuất thành công",
      });
    }

    await pool.execute("UPDATE users SET refresh_token = NULL WHERE id = ?", [
      users[0].id,
    ]);

    return res.status(200).json({
      message: "Đăng xuất thành công",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi logout",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  getMe,
  logout,
};