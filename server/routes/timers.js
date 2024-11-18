const express = require("express");
const router = express.Router();
const Timer = require("../models/timer");
const { authMiddleware } = require("../middleware/auth");

// Применяем middleware auth ко всем маршрутам в этом файле
router.use(authMiddleware);

// Получение всех активных таймеров текущего пользователя
router.get("/", async (req, res) => {
  try {
    const userId = req.user._id;
    const timers = await Timer.find({ userId, isActive: true });
    res.json(timers);
  } catch (error) {
    console.error("Ошибка при получении всех таймеров:", error);
    res.status(500).json({ error: "Ошибка на сервере при получении таймеров" });
  }
});

// Получение всех завершённых таймеров текущего пользователя
router.get("/completed", async (req, res) => {
  try {
    const userId = req.user._id;
    const completedTimers = await Timer.find({ userId, isActive: false });
    res.json(completedTimers);
  } catch (error) {
    console.error("Ошибка при получении завершённых таймеров:", error);
    res.status(500).json({ error: "Ошибка на сервере при получении завершённых таймеров" });
  }
});

// Получение таймера по ID для текущего пользователя
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user._id;
    const timer = await Timer.findOne({ _id: req.params.id, userId });
    if (!timer) {
      return res.status(404).json({ error: "Таймер не найден" });
    }
    res.json(timer);
  } catch (error) {
    console.error("Ошибка при получении таймера по ID:", error);
    res.status(500).json({ error: "Ошибка на сервере при получении таймера" });
  }
});

// Создание нового таймера
router.post("/", async (req, res) => {
  try {
    const { description } = req.body;
    const userId = req.user._id;

    if (!description) {
      return res.status(400).json({ error: "Необходимо указать описание таймера" });
    }

    const newTimer = new Timer({
      userId,
      description,
      start: new Date(),
      isActive: true,
    });

    const savedTimer = await newTimer.save();
    res.status(201).json(savedTimer);
  } catch (error) {
    console.error("Ошибка создания таймера:", error);
    res.status(500).json({ error: "Ошибка создания таймера" });
  }
});

// Остановка таймера по ID для текущего пользователя
router.patch("/:id", async (req, res) => {
  try {
    const userId = req.user._id;
    const timer = await Timer.findOne({ _id: req.params.id, userId, isActive: true });
    if (!timer) {
      return res.status(404).json({ error: "Таймер не найден или уже остановлен" });
    }

    timer.end = new Date();
    timer.duration = timer.end - timer.start;
    timer.isActive = false;
    await timer.save();

    res.json(timer);
  } catch (error) {
    console.error("Ошибка при остановке таймера:", error);
    res.status(500).json({ error: "Ошибка на сервере при остановке таймера" });
  }
});

module.exports = router;
