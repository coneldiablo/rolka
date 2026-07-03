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

## Telegram

Set these variables:

```bash
TELEGRAM_BOT_TOKEN=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_MINI_APP_URL="https://your-domain.example"
```

Webhook endpoint:

```text
POST /api/telegram/webhook
```

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
