const mysql = require("mysql2/promise");
require("dotenv").config();

// PORT=3000

// DB_HOST=localhost
// DB_PORT=3306
// DB_USER=root
// DB_PASSWORD=Trankhacnhu132!
// DB_NAME=datadoan

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;