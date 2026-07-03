import { createBot } from "@/bot/bot";
import { handleApiError, jsonOk } from "@/server/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
    const update = await request.json();
    const bot = createBot();
    await bot.handleUpdate(update);
    return jsonOk({ handled: true });
  } catch (error) {
    return handleApiError(error);
  }
}
