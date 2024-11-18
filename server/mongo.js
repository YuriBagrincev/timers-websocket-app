require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
  console.log("Подключение к MongoDB успешно установлено");
});

mongoose.connection.on("error", (err) => {
  console.error("Ошибка подключения к MongoDB:", err);
});

module.exports = mongoose;
