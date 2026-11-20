const MENU = {
  inline_keyboard: [
    [{ text: "🧰 Инструменты", callback_data: "tools" }],
    [{ text: "✍️ Генератор промптов", callback_data: "prompts" }],
    [{ text: "🤖 Заказать бота", callback_data: "order" }],
    [{ text: "ℹ️ О проекте", callback_data: "about" }]
  ]
};

const TOOLS = [
  ["ChatGPT", "Помощь с текстами, идеями, анализом и прототипами.", "https://chatgpt.com/"],
  ["Claude", "Работа с текстом, анализом и программным кодом.", "https://claude.ai/"],
  ["Canva", "Дизайн публикаций, презентаций и простых макетов.", "https://www.canva.com/"],
  ["Photopea", "Редактор изображений в браузере.", "https://www.photopea.com/"],
  ["Excalidraw", "Быстрые схемы, карты процессов и диаграммы.", "https://excalidraw.com/"]
];

const PROMPTS = {
  content: "Ты редактор Telegram-канала. Подготовь пост на тему: [ТЕМА]. Аудитория: русскоязычные пользователи СНГ. Стиль: ясно, конкретно, без кликбейта. Структура: заголовок, польза, 3 практических пункта, вывод. Не выдумывай факты и ссылки.",
  business: "Ты консультант малого бизнеса. Предложи 5 способов автоматизировать процесс [ПРОЦЕСС] в компании [ТИП БИЗНЕСА]. Для каждого укажи проблему, решение, сложность внедрения и риски. Не обещай гарантированную экономию.",
  bot: "Ты системный аналитик. Составь техническое задание Telegram-бота для [ТИП БИЗНЕСА]. Опиши роли, сценарии, команды, данные, ошибки, безопасность и критерии приёмки. Отделяй обязательные функции от будущих улучшений."
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram API error: ${result.description || "unknown"}`);
  return result.result;
}

async function send(env, chatId, text, replyMarkup) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    disable_web_page_preview: true
  });
}

async function answerCallback(env, callbackId, text = "") {
  return telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  });
}

async function setState(env, userId, state) {
  await env.DB.prepare(
    "INSERT INTO user_state (telegram_user_id, state) VALUES (?, ?) ON CONFLICT(telegram_user_id) DO UPDATE SET state=excluded.state, updated_at=datetime('now')"
  ).bind(userId, state).run();
}

async function getState(env, userId) {
  const row = await env.DB.prepare(
    "SELECT state FROM user_state WHERE telegram_user_id = ?"
  ).bind(userId).first();
  return row?.state || null;
}

async function clearState(env, userId) {
  await env.DB.prepare("DELETE FROM user_state WHERE telegram_user_id = ?")
    .bind(userId).run();
}

function mainMenuText() {
  return "BYTE FOREST — цифровые инструменты и автоматизация.\n\nВыберите, что вам нужно:";
}

async function handleStart(env, chatId) {
  await send(env, chatId,
    "Привет! Это BYTE FOREST 🌲\n\nНаходим полезные цифровые инструменты, показываем возможности автоматизации и разрабатываем Telegram-ботов для бизнеса.\n\nВыберите действие:",
    MENU
  );
}

async function handleTools(env, chatId) {
  const text = TOOLS.map(([name, description, url]) =>
    `• ${name} — ${description}\n${url}`
  ).join("\n\n");
  await send(env, chatId, `🧰 Подборка инструментов\n\n${text}\n\nПеред использованием проверяйте условия и доступность сервисов в своей стране.`, MENU);
}

async function handlePrompts(env, chatId) {
  await send(env, chatId, "Выберите шаблон. Скопируйте его и замените текст в квадратных скобках:", {
    inline_keyboard: [
      [{ text: "Пост для Telegram", callback_data: "prompt_content" }],
      [{ text: "Идеи автоматизации бизнеса", callback_data: "prompt_business" }],
      [{ text: "Техническое задание бота", callback_data: "prompt_bot" }],
      [{ text: "⬅️ В меню", callback_data: "home" }]
    ]
  });
}

async function handleOrder(env, chatId, userId) {
  await setState(env, userId, "awaiting_order");
  await send(env, chatId,
    "Расскажите одним сообщением:\n\n1. Чем занимается ваш бизнес?\n2. Что должен делать бот или автоматизация?\n3. Как с вами связаться (необязательно)?\n\nНе отправляйте пароли, платёжные данные или другую секретную информацию.\n\nДля отмены отправьте /cancel."
  );
}

async function handleText(env, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = (message.text || "").trim();

  if (text === "/cancel") {
    await clearState(env, userId);
    await send(env, chatId, "Заявка отменена.", MENU);
    return;
  }

  const state = await getState(env, userId);
  if (state === "awaiting_order") {
    if (text.length < 15) {
      await send(env, chatId, "Пожалуйста, добавьте немного деталей (минимум 15 символов) или отправьте /cancel.");
      return;
    }
    const username = message.from.username || null;
    const inserted = await env.DB.prepare(
      "INSERT INTO leads (telegram_user_id, username, request_text) VALUES (?, ?, ?)"
    ).bind(userId, username, text.slice(0, 3000)).run();

    await clearState(env, userId);
    await send(env, chatId, `Спасибо! Заявка №${inserted.meta.last_row_id} сохранена. Мы свяжемся с вами после проверки.`, MENU);

    if (env.ADMIN_CHAT_ID) {
      const adminText = `🆕 Новая заявка BYTE FOREST\nНомер: ${inserted.meta.last_row_id}\nПользователь: ${username ? "@" + username : "без username"}\nTelegram ID: ${userId}\n\n${text.slice(0, 3000)}`;
      try { await send(env, env.ADMIN_CHAT_ID, adminText); } catch (e) { console.error("Admin notification failed", e.message); }
    }
    return;
  }

  if (text.startsWith("/")) {
    await send(env, chatId, "Неизвестная команда. Используйте /start или кнопки меню.", MENU);
  } else {
    await send(env, chatId, "Выберите действие в меню. Чтобы оставить заявку, нажмите «Заказать бота».", MENU);
  }
}

async function handleCallback(env, callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data || "";
  await answerCallback(env, callback.id);

  if (data === "home") return send(env, chatId, mainMenuText(), MENU);
  if (data === "tools") return handleTools(env, chatId);
  if (data === "prompts") return handlePrompts(env, chatId);
  if (data === "order") return handleOrder(env, chatId, callback.from.id);
  if (data === "about") return send(env, chatId,
    "BYTE FOREST — независимый цифровой проект о полезных инструментах, AI и автоматизации.\n\nМы также создаём Telegram-ботов и небольшие системы для бизнеса.\n\nХотите обсудить задачу? Нажмите «Заказать бота».", MENU);

  if (data.startsWith("prompt_")) {
    const key = data.replace("prompt_", "");
    const prompt = PROMPTS[key];
    if (prompt) return send(env, chatId, `📋 Шаблон промпта\n\n${prompt}`, MENU);
  }
}

async function handleUpdate(env, update) {
  if (update.callback_query) return handleCallback(env, update.callback_query);
  if (update.message?.text) {
    const message = update.message;
    if (message.text === "/start") return handleStart(env, message.chat.id);
    if (message.text === "/help") return send(env, message.chat.id,
      "Команды:\n/start — меню\n/tools — каталог\n/prompt — шаблоны промптов\n/order — заявка\n/about — о проекте\n/cancel — отменить заявку", MENU);
    if (message.text === "/tools") return handleTools(env, message.chat.id);
    if (message.text === "/prompt") return handlePrompts(env, message.chat.id);
    if (message.text === "/order") return handleOrder(env, message.chat.id, message.from.id);
    if (message.text === "/about") return send(env, message.chat.id, "BYTE FOREST — цифровые инструменты, AI и автоматизация для бизнеса.", MENU);
    if (message.text === "/status") {
      if (!env.ADMIN_CHAT_ID || String(message.from.id) !== String(env.ADMIN_CHAT_ID)) {
        return send(env, message.chat.id, "Команда доступна только администратору.");
      }
      return send(env, message.chat.id, "✅ Worker отвечает. D1 подключена, webhook получил сообщение.");
    }
    return handleText(env, message);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "byte-forest-bot", version: "0.1.0" });
    }

    if (url.pathname !== "/webhook" || request.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    const expected = env.TELEGRAM_WEBHOOK_SECRET;
    const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!expected || received !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const update = await request.json();
      await handleUpdate(env, update);
      return json({ ok: true });
    } catch (error) {
      console.error("Update processing failed", error.message);
      return json({ ok: false }, 200);
    }
  }
};
