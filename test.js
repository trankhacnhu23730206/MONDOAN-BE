
// CREATE DATABASE IF NOT EXISTS be_donan;
// USE be_donan;

// CREATE TABLE IF NOT EXISTS users (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     username VARCHAR(50) NOT NULL UNIQUE,
//     password VARCHAR(255) NOT NULL,
//     refresh_token TEXT NULL,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
// );


// Quan hệ giữa các bảng
// users 1 - n user_addresses
// users 1 - n carts
// users 1 - n orders
// users 1 - n reviews
// categories 1 - n products
// categories có thể cha-con qua parent_id
// products 1 - n product_images
// products 1 - 1 inventories
// products 1 - n cart_items
// products 1 - n order_items
// products 1 - n reviews
// carts 1 - n cart_items
// orders 1 - n order_items
// orders 1 - n payments