# BYTE FOREST — Telegram bot MVP

Первый MVP без платных AI API: каталог инструментов, шаблонный генератор промптов и приём заявок на разработку.

## Стек
- Cloudflare Workers (JavaScript, module syntax)
- Cloudflare D1 (SQLite)
- Telegram Bot API (webhook)
- GitHub для исходного кода

## Структура
```text
byte-forest/
├── src/
│   └── index.js
├── migrations/
│   └── 0001_init.sql
├── .gitignore
├── package.json
├── wrangler.toml
├── SPEC.md
└── README.md
```

## 1. Создать Telegram-бота
1. Откройте @BotFather.
2. Выполните `/newbot`, задайте имя и username.
3. Сохраните токен локально. Не отправляйте его в чат и не добавляйте в Git.
4. Не добавляйте бота администратором канала на этом этапе: публикации в канал будут отдельной следующей функцией.

## 2. Подготовить Cloudflare
1. Создайте аккаунт на https://dash.cloudflare.com/.
2. В Workers & Pages создайте Worker или разверните проект через Wrangler.
3. Создайте D1 database с именем `byte-forest-db`.
4. Скопируйте `database_id` из панели Cloudflare в `wrangler.toml`.
5. Выполните миграцию:
   `npx wrangler d1 execute byte-forest-db --remote --file=./migrations/0001_init.sql`
6. Установите секреты:
   `npx wrangler secret put BOT_TOKEN`
   `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`
   `npx wrangler secret put ADMIN_CHAT_ID`
   Для `ADMIN_CHAT_ID` используйте свой Telegram numeric user ID. Узнать его можно через надёжный бот-помощник, затем удалите его из переписки. Не используйте чужой ID.
7. Установите зависимости: `npm install`.
8. Разверните: `npm run deploy`.

## 3. Настроить webhook
После успешного deploy получите URL вида `https://ИМЯ.WORKERS.DEV`.

Установите webhook (подставьте URL Worker, токен и тот же секрет, который сохранили как TELEGRAM_WEBHOOK_SECRET):
```bash
curl -X POST "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
  -d "url=https://<ВАШ-WORKER>.workers.dev/webhook" \
  -d "secret_token=<ВАШ-СЕКРЕТ>"
```
Не публикуйте команду с реальным токеном. Альтернатива — выполнить её в локальном терминале, не вставляя токен в GitHub.

Проверить:
```bash
curl "https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo"
```

## 4. Проверить бота
В Telegram отправьте `/start`, затем проверьте:
- «Инструменты» — каталог.
- «Промпты» — готовые шаблоны.
- «Заказать бота» — форма заявки.
- `/help` — справка.

Заявки сохраняются в D1 и отправляются администратору, если `ADMIN_CHAT_ID` настроен.

## Важные ограничения MVP
- AI-ответов через Claude или OpenAI API пока нет — чтобы не создавать скрытые расходы.
- Генератор промптов работает по заранее подготовленным шаблонам.
- Публикация постов в канал, аналитика просмотров и AI-обработка заявок — следующий этап.
- Бесплатные тарифы имеют лимиты и условия, которые могут меняться. Проверьте актуальные условия Cloudflare перед коммерческим запуском.
- Перед публичным запуском добавьте политику конфиденциальности и согласие на обработку данных в соответствии с применимым законодательством.

## Безопасность
- Никогда не коммитьте `.dev.vars`, токены, API-ключи или реальные ID.
- Для webhook используйте `TELEGRAM_WEBHOOK_SECRET`.
- Доступ администратора ограничен значением `ADMIN_CHAT_ID`.
- Не отправляйте секреты в ChatGPT/Claude; используйте Cloudflare Secrets.
