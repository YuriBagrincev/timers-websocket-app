const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const http = require("http");
const WebSocket = require("ws");

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Создаю WebSocket-сервер

const PORT = process.env.PORT || 3000;

const User = require("./models/user");
const Timer = require("./models/timer");
const Session = require("./models/session");

// Middleware
const { authMiddleware, createSession, deleteSession } = require("./middleware/auth");

// MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log("Подключение к MongoDB успешно установлено");
  })
  .catch((err) => {
    console.error("Ошибка подключения к MongoDB:", err);
  });

// Middleware для обработки JSON
app.use(express.json());

// Маршруты аутентификации

// Регистрирую пользователя
app.post("/signup", async (req, res) => {
  console.log("Получен запрос на /signup:", req.body);
  const { username, password } = req.body;

  try {
    // Проверяю, существует ли пользователь
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Пользователь с таким именем уже существует" });
    }

    // Создаю нового пользователя
    const newUser = new User({ username, password });
    await newUser.save();

    // Создаю сессию
    const sessionId = await createSession(newUser);

    res.status(201).json({ sessionId });
  } catch (err) {
    console.error("Ошибка при регистрации:", err);
    res.status(500).json({ error: "Ошибка на сервере при регистрации" });
  }
});

// Вход пользователя
app.post("/login", async (req, res) => {
  console.log("Получен запрос на /login:", req.body);
  const { username, password } = req.body;

  try {
    // Ищу пользователя
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    }

    // Создаю сессию
    const sessionId = await createSession(user);

    res.json({ sessionId });
  } catch (err) {
    console.error("Ошибка при входе:", err);
    res.status(500).json({ error: "Ошибка на сервере при входе" });
  }
});

// Выход пользователя
app.post("/logout", authMiddleware, async (req, res) => {
  const authorizationHeader = req.headers["authorization"];
  const sessionId = authorizationHeader.split(" ")[1];

  try {
    await deleteSession(sessionId);
    res.json({ message: "Вы успешно вышли из системы" });
  } catch (err) {
    console.error("Ошибка при выходе:", err);
    res.status(500).json({ error: "Ошибка на сервере при выходе" });
  }
});

// Маршруты таймеров

// Получение всех активных таймеров текущего пользователя
app.get("/api/timers", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const timers = await Timer.find({ userId, isActive: true });
    res.json(timers);
  } catch (error) {
    console.error("Ошибка при получении всех таймеров:", error);
    res.status(500).json({ error: "Ошибка на сервере при получении таймеров" });
  }
});

// Создание нового таймера
app.post("/api/timers", authMiddleware, async (req, res) => {
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

    // После создания таймера, отправка обновлённого списока таймеров через WebSocket
    sendAllTimersToUser(userId);
  } catch (error) {
    console.error("Ошибка создания таймера:", error);
    res.status(500).json({ error: "Ошибка создания таймера" });
  }
});

// Получение всех завершённых таймеров текущего пользователя
app.get("/api/timers/completed", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const completedTimers = await Timer.find({ userId, isActive: false });
    res.json(completedTimers);
  } catch (error) {
    console.error("Ошибка при получении завершённых таймеров:", error);
    res.status(500).json({ error: "Ошибка на сервере при получении завершённых таймеров" });
  }
});

// Остановка таймера по ID для текущего пользователя
app.patch("/api/timers/:id", authMiddleware, async (req, res) => {
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

    // Обновляю список остановленных таймеров через WebSocket
    sendAllTimersToUser(userId);
  } catch (error) {
    console.error("Ошибка при остановке таймера:", error);
    res.status(500).json({ error: "Ошибка на сервере при остановке таймера" });
  }
});

// Функции для работы с WebSocket

// Словарь для хранения WebSocket-подключений
const clients = {};

// Обработка новых подключений WebSocket
wss.on("connection", (ws, req) => {
  // Аутентификация WebSocket
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const sessionId = params.get('sessionId');

  if (!sessionId) {
    ws.send(JSON.stringify({ error: "Unauthorized: No sessionId provided" }));
    ws.close();
    return;
  }

  // Проверяю сессию в базе данных
  Session.findOne({ sessionId }).populate('userId').then(session => {
    if (!session || !session.userId) {
      ws.send(JSON.stringify({ error: "Unauthorized: Invalid sessionId" }));
      ws.close();
      return;
    }

    const userId = session.userId._id.toString();
    // Сохраняю WebSocket-подключение для пользователя
    clients[userId] = ws;

    // Отправляю актуальный список таймеров этому пользователю
    sendAllTimersToUser(userId);

    ws.on('close', () => {
      // Удаляю пользователя из списка при отключении
      delete clients[userId];
    });
  }).catch(err => {
    console.error("Ошибка при аутентификации WebSocket:", err);
    ws.close();
  });
});

// Функция для отправки all_timers пользователю
async function sendAllTimersToUser(userId) {
  const ws = clients[userId];
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const activeTimers = await Timer.find({ userId, isActive: true });
      const completedTimers = await Timer.find({ userId, isActive: false });
      ws.send(JSON.stringify({
        type: 'all_timers',
        data: {
          activeTimers,
          completedTimers
        }
      }));
    } catch (err) {
      console.error("Ошибка при отправке all_timers:", err);
    }
  }
}

// Отправка active_timers каждую 1
setInterval(async () => {
  for (const userId in clients) {
    const ws = clients[userId];
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const activeTimers = await Timer.find({ userId, isActive: true });
        // Рассчитываем время активности таймеров
        const timersWithDuration = activeTimers.map(timer => ({
          ...timer.toObject(),
          currentDuration: Date.now() - new Date(timer.start).getTime()
        }));
        ws.send(JSON.stringify({
          type: 'active_timers',
          data: timersWithDuration
        }));
      } catch (err) {
        console.error("Ошибка при отправке active_timers:", err);
      }
    }
  }
}, 1000);

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
