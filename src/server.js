const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Hello World Express API 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Kết nối MySQL thành công");
    connection.release();

    app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Kết nối MySQL thất bại:", error.message);
    process.exit(1);
  }
};

startServer();