const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const inquirer = require("inquirer");
const WebSocket = require("ws");
require("dotenv").config();

const SESSION_FILE = path.join(__dirname, "session.json");

// Проверяю наличия SERVER_URL
if (!process.env.SERVER_URL) {
  console.error("SERVER_URL is not defined in .env file.");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL;

let sessionId = null;
let ws = null;
let activeTimers = [];
let completedTimers = [];

// Сохраняю sessionId
function saveSession(sessionIdToSave) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ sessionId: sessionIdToSave }));
  sessionId = sessionIdToSave;
}

// Загружаю sessionId
function loadSession() {
  if (fs.existsSync(SESSION_FILE)) {
    const data = fs.readFileSync(SESSION_FILE);
    try {
      const parsedData = JSON.parse(data);
      sessionId = parsedData.sessionId || null;
    } catch (e) {
      console.error("Ошибка при загрузке сессии:", e.message);
    }
  }
}

// Удаляю sessionId
function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
    console.log("Session cleared successfully.");
  }
  sessionId = null;
}

// Подключаю к WebSocket-серверу
function connectWebSocket() {
  if (!sessionId) return;

  // Закрываю соединение
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket(`${SERVER_URL.replace(/^http/, 'ws')}?sessionId=${sessionId}`);

  ws.on('open', () => {
    console.log("WebSocket connection established.");
  });

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === 'all_timers') {
        activeTimers = parsedMessage.data.activeTimers;
        completedTimers = parsedMessage.data.completedTimers;
      } else if (parsedMessage.type === 'active_timers') {
        activeTimers = parsedMessage.data;
      }
    } catch (err) {
      console.error("Ошибка при обработке сообщения WebSocket:", err);
    }
  });

  ws.on('close', () => {
    console.log("WebSocket connection closed.");
  });

  ws.on('error', (error) => {
    console.error("WebSocket error:", error);
  });
}

// Функция для начала
async function main() {
  loadSession();

  if (sessionId) {
    connectWebSocket();
  }

  while (true) {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'command',
          message: 'Enter command (signup, login, logout, start, stop, status, exit):',
        },
      ]);

      const [command, ...args] = answers.command.trim().split(' ');

      if (!sessionId && command !== 'signup' && command !== 'login' && command !== 'exit') {
        console.log("You need to login first.");
        continue;
      }

      switch (command) {
        case 'signup':
          await signup();
          break;

        case 'login':
          await login();
          break;

        case 'logout':
          await logout();
          break;

        case 'start':
          await start(args.join(' '));
          break;

        case 'stop':
          await stop(args[0]);
          break;

        case 'status':
          await showStatus();
          break;

        case 'exit':
          await exitProgram();
          return;

        default:
          console.log("Unknown command.");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }
  }
}

// Регистрация
async function signup() {
  const answers = await inquirer.prompt([
    { type: "input", name: "username", message: "Username:" },
    { type: "password", name: "password", message: "Password:" },
  ]);

  console.log("Отправляем данные на /signup:", answers);

  try {
    const response = await fetch(`${SERVER_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });

    const data = await response.json();

    if (response.ok) {
      // Закрываю предыдущее WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        ws = null;
      }

      saveSession(data.sessionId);
      console.log("Signed up successfully!");
      connectWebSocket();
    } else {
      console.error("Error signing up:", data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Вход
async function login() {
  const answers = await inquirer.prompt([
    { type: "input", name: "username", message: "Username:" },
    { type: "password", name: "password", message: "Password:" },
  ]);

  console.log("Отправляем данные на /login:", answers);

  try {
    const response = await fetch(`${SERVER_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });

    const data = await response.json();

    if (response.ok) {
      // Закрываю предыдущее WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        ws = null;
      }

      saveSession(data.sessionId);
      console.log("Logged in successfully!");
      connectWebSocket();
    } else {
      console.error("Error logging in:", data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Выход
async function logout() {
  if (!sessionId) {
    return console.error("You are not logged in.");
  }

  try {
    const response = await fetch(`${SERVER_URL}/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionId}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      clearSession();
      console.log("Logged out successfully!");
      if (ws) {
        ws.close();
        ws = null;
      }
      activeTimers = [];
      completedTimers = [];
    } else {
      console.error("Error logging out:", data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Запуск таймера
async function start(description) {
  if (!description) {
    console.error("Please provide a description for the timer.");
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL}/api/timers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionId}`,
      },
      body: JSON.stringify({ description }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`Started timer "${description}", ID: ${data._id}`);
      // Обновление таймера через WebSocket
    } else {
      console.error("Error starting timer:", data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Остановка таймера
async function stop(timerId) {
  if (!timerId) {
    console.error("Please provide the ID of the timer to stop.");
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL}/api/timers/${timerId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionId}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`Timer ${timerId} stopped.`);
      // Обновление таймера через WebSocket
    } else {
      console.error("Error stopping timer:", data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Статус таймеров
async function showStatus() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'statusType',
      message: 'Which timers do you want to see?',
      choices: ['Active Timers', 'Completed Timers'],
    },
  ]);

  if (answers.statusType === 'Active Timers') {
    if (activeTimers.length > 0) {
      console.table(
        activeTimers.map((timer) => ({
          ID: timer._id,
          Task: timer.description,
          'Current Duration': `${(timer.currentDuration / 1000).toFixed(1)}s`,
        }))
      );
    } else {
      console.log("No active timers.");
    }
  } else {
    if (completedTimers.length > 0) {
      console.table(
        completedTimers.map((timer) => ({
          ID: timer._id,
          Task: timer.description,
          Duration: `${(timer.duration / 1000).toFixed(1)}s`,
        }))
      );
    } else {
      console.log("No completed timers.");
    }
  }
}

// Выход из программы
async function exitProgram() {
  if (ws) {
    ws.close();
  }
  process.exit(0);
}

// Запуск программы
main();
