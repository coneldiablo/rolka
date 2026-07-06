# Rolka

Telegram + Web/Mini App roleplay bot with character cards, RP modes, context rescue, image generation, adult-only gate, and Free/Plus/Pro subscription limits.

## Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Redis + BullMQ queue scaffold for background work
- grammY for Telegram bot webhook handling
- OpenAI-compatible provider layer for AITUNNEL, OpenRouter, DeepSeek, and Gemini
- Gemini image generation adapter
- Vitest unit tests
- Lucide icons and custom CSS UI based on the `ui-ux-pro-max` dark cinematic design system

## Local Setup

```bash
npm install
cp .env.example .env
npx prisma generate
npm run dev
```

The app runs at `http://localhost:3000`.

For database-backed API calls, set `DATABASE_URL` to PostgreSQL and run:

```bash
npm run prisma:migrate
```

Set `REDIS_URL` when you want BullMQ-backed image generation and context summary queues.

## Docker Setup

Docker is the recommended cross-platform setup for Windows, macOS, and Linux.

```bash
cp .env.docker.example .env
# fill TELEGRAM_BOT_TOKEN and AI provider keys in .env
# change APP_PORT if 3000 is already busy
docker compose up --build
```

This starts:

- `app`: Next.js dev server at `http://localhost:3000`
- `bot`: Telegram bot in polling mode
- `db`: PostgreSQL 16
- `redis`: Redis 7

The app container runs `prisma db push` on startup so a fresh local database is created from `prisma/schema.prisma`.

Useful commands:

```bash
docker compose logs -f app
docker compose logs -f bot
npm run db:backup
docker compose down
docker compose down -v
```

`npm run db:backup` writes a PostgreSQL custom-format dump to `backups/`. Keep these dumps outside the project folder if you need protection from accidental volume deletion or machine failure.

## Telegram

Set these variables:

```bash
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_MINI_APP_URL="https://your-domain.example"
ADMIN_TELEGRAM_IDS="123456789,987654321"
```

Webhook endpoint:

```text
POST /api/telegram/webhook
```

For local Docker development, the `bot` service uses polling and deletes any configured webhook on startup.

## Telegram Admin Panel

Admins manage the project inside the Telegram bot through inline buttons. Admin users see an `Админка` button in the main menu.

Admin features:

- view users registered through the bot
- view paid subscription count and Stars revenue
- open a user card with chats, messages, characters, purchases, and current access
- grant `FREE`, `PLUS`, or `PRO` access manually
- add another admin by numeric Telegram ID

Set initial admins with `ADMIN_TELEGRAM_IDS`. If no admin IDs are configured and the database has no admins yet, the first user who sends `/start` becomes the bootstrap admin. Admins always receive Pro-level access in the bot and web API.

Telegram Stars subscription flows are wired through grammY invoice buttons and these API endpoints:

```text
POST /api/payments/stars/pre-checkout
POST /api/payments/stars/success
```

## AI Providers

The text provider layer tries configured providers with fallback:

```bash
AITUNNEL_API_KEY=""
AITUNNEL_MODEL="deepseek-v4-flash"
OPENROUTER_API_KEY=""
DEEPSEEK_API_KEY=""
GEMINI_API_KEY=""
AI_DEFAULT_TEXT_PROVIDER="aitunnel"
AI_DEFAULT_IMAGE_PROVIDER="gemini"
AI_PROVIDER_TIMEOUT_MS="60000"
AI_PROVIDER_MAX_RETRIES="1"
```

AITUNNEL is configured as OpenAI-compatible at `https://api.aitunnel.ru/v1/` and defaults to `deepseek-v4-flash`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

Current test coverage includes plan limits, 18+ safety gate, prompt pipeline, context export, and AI provider fallback.
