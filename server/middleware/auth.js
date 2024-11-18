const crypto = require('crypto');
const Session = require('../models/session');

async function authMiddleware(req, res, next) {
  console.log("Проверка авторизации...");

  const authorizationHeader = req.headers["authorization"];
  if (!authorizationHeader) {
    console.log("Нет заголовка авторизации");
    return res.status(401).json({ error: "Неавторизован" });
  }

  const parts = authorizationHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    console.log("Неправильный формат заголовка авторизации");
    return res.status(401).json({ error: "Неправильный формат заголовка авторизации" });
  }

  const sessionId = parts[1];
  if (!sessionId) {
    console.log("Не передан sessionId");
    return res.status(401).json({ error: "Неавторизован" });
  }

  // Проверка sessionId в базе данных
  try {
    const session = await Session.findOne({ sessionId }).populate('userId');
    if (!session) {
      console.log("Недействительная сессия");
      return res.status(401).json({ error: "Недействительная сессия" });
    }

    // Проверка существования пользователя
    if (!session.userId) {
      console.log("Пользователь, связанный с сессией, не найден");
      return res.status(401).json({ error: "Недействительная сессия" });
    }

    // Сохраняем информацию о пользователе для дальнейшего использования
    req.user = session.userId;

    console.log("Авторизация пройдена");
    next();
  } catch (err) {
    console.error("Ошибка при проверке сессии:", err);
    res.status(500).json({ error: "Ошибка на сервере при проверке сессии" });
  }
}

// Функция для создания новой сессии
async function createSession(user) {
  const sessionId = generateSessionId();

  const session = new Session({
    sessionId,
    userId: user._id,
  });

  await session.save();

  return sessionId;
}

// Функция для удаления сессии
async function deleteSession(sessionId) {
  await Session.deleteOne({ sessionId });
}

// Функция для генерации уникального sessionId
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  authMiddleware,
  createSession,
  deleteSession,
};
