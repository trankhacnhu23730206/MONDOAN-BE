const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/token");

let userColumnsCache = null;

const getUserColumns = async () => {
  if (userColumnsCache) return userColumnsCache;

  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
    [process.env.DB_NAME]
  );

  userColumnsCache = columns.map((column) => column.COLUMN_NAME);
  return userColumnsCache;
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const mapUserResponse = (user) => ({
  id: user.id,
  user_name: user.user_name || null,
  username: user.user_name || null,
  fullName: user.user_name || null,
  email: user.email || null,
  phone: user.phone || null,
  avatar_url: user.avatar_url || null,
  created_at: user.created_at || null,
  updated_at: user.updated_at || null,
});

const getUserById = async (userId) => {
  const userColumns = await getUserColumns();
  const selectColumns = [
    "id",
    "user_name",
    "email",
    "phone",
    "avatar_url",
    "created_at",
    "updated_at",
  ].filter((column) => userColumns.includes(column));

  const [users] = await pool.execute(
    `SELECT ${selectColumns.join(", ")} FROM users WHERE id = ?`,
    [userId]
  );

  return users[0] || null;
};

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
      role: "customer",
    };

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [
      refreshToken,
      newUser.id,
    ]);

    return res.status(201).json({
      message: "Đăng ký user thành công",
      user: mapUserResponse({ id: result.insertId, user_name: username, email }),
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và password",
      });
    }

    const [users] = await pool.execute("SELECT * FROM users WHERE user_name = ? OR email = ?", [
      email, email
    ]);

    if (users.length === 0) {
      return res.status(401).json({
        message: "Sai email hoặc password",
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
      role: user.role || "customer",
    };


    const accessToken = generateAccessToken(payloadUser);
    const refreshToken = generateRefreshToken(payloadUser);

    await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [
      refreshToken,
      user.id,
    ]);

    return res.status(200).json({
      message: "Đăng nhập thành công",
      user: mapUserResponse(user),
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
          username: userInDb.user_name,
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
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy user",
      });
    }

    return res.status(200).json({
      message: "Lấy thông tin user thành công",
      user: mapUserResponse(user),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi lấy profile",
      error: error.message,
    });
  }
};

// UPDATE PROFILE / ME
const updateMe = async (req, res) => {
  try {
    const userColumns = await getUserColumns();
    const currentUser = await getUserById(req.user.id);

    if (!currentUser) {
      return res.status(404).json({
        message: "Không tìm thấy user",
      });
    }

    const userName = normalizeText(
      req.body.user_name || req.body.username || req.body.fullName || req.body.name
    );
    const email = normalizeText(req.body.email);
    const phone = normalizeText(req.body.phone);
    const avatarUrl = normalizeText(req.body.avatar_url || req.body.avatarUrl);
    const currentPassword = normalizeText(req.body.currentPassword);
    const newPassword = normalizeText(req.body.newPassword);

    if (!userName) {
      return res.status(400).json({
        message: "Vui lòng nhập họ tên hoặc username",
      });
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        message: "Vui lòng nhập email hợp lệ",
      });
    }

    const [duplicateUsers] = await pool.execute(
      "SELECT id FROM users WHERE (user_name = ? OR email = ?) AND id != ?",
      [userName, email, req.user.id]
    );

    if (duplicateUsers.length > 0) {
      return res.status(409).json({
        message: "Username hoặc email đã tồn tại",
      });
    }

    let passwordHash = null;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          message: "Vui lòng nhập mật khẩu hiện tại",
        });
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({
          message: "Mật khẩu mới phải có ít nhất 6 ký tự",
        });
      }

      const [users] = await pool.execute(
        "SELECT password_hash FROM users WHERE id = ?",
        [req.user.id]
      );

      const passwordMatched = await bcrypt.compare(
        currentPassword,
        users[0].password_hash
      );

      if (!passwordMatched) {
        return res.status(400).json({
          message: "Mật khẩu hiện tại không đúng",
        });
      }

      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const fields = [];
    const values = [];

    if (userColumns.includes("user_name")) {
      fields.push("user_name = ?");
      values.push(userName);
    }

    if (userColumns.includes("email")) {
      fields.push("email = ?");
      values.push(email);
    }

    if (userColumns.includes("phone")) {
      fields.push("phone = ?");
      values.push(phone);
    }

    if (userColumns.includes("avatar_url")) {
      fields.push("avatar_url = ?");
      values.push(avatarUrl);
    }

    if (passwordHash && userColumns.includes("password_hash")) {
      fields.push("password_hash = ?");
      values.push(passwordHash);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        message: "Không có dữ liệu hợp lệ để cập nhật",
      });
    }

    values.push(req.user.id);

    await pool.execute(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    const updatedUser = await getUserById(req.user.id);

    return res.status(200).json({
      message: "Cập nhật tài khoản thành công",
      user: mapUserResponse(updatedUser),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Lỗi server khi cập nhật tài khoản",
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
  updateMe,
  logout,
};