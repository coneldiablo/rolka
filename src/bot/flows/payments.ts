import { getPlanPriceStars, type Plan } from "@/domain/plans";
import { Bot } from "grammy";
import { mainMenuKeyboard, subscriptionKeyboard } from "../keyboards";
import { getChatState, getUserProfile } from "../sessions";
import { subscriptionText } from "../texts";
import type { TelegramFrom } from "../types";
import { addDays } from "../utils";

type PaymentsFlowDeps = {
  recordSuccessfulPayment: (
    telegramUserId: number,
    plan: Exclude<Plan, "FREE">,
    chargeId: string,
    payload: string
  ) => Promise<void>;
  syncTelegramUser: (from: TelegramFrom) => Promise<unknown>;
};

export function registerPaymentsFlow(bot: Bot, deps: PaymentsFlowDeps) {
  bot.callbackQuery("subscription", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(subscriptionText(), {
      parse_mode: "HTML",
      reply_markup: subscriptionKeyboard()
    });
  });

  bot.callbackQuery("subscribe_plus", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.replyWithInvoice(
      "Rolka Plus",
      "Безлимит персонажей и чатов, полный экспорт контекста, больше фото и 18+ сообщений.",
      "SUBSCRIPTION_PLUS",
      "XTR",
      [{ label: "Rolka Plus", amount: getPlanPriceStars("PLUS") }]
    );
  });

  bot.callbackQuery("subscribe_pro", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.replyWithInvoice(
      "Rolka Pro",
      "Премиум-модели, priority queue, long memory, lorebook и больше генераций фото.",
      "SUBSCRIPTION_PRO",
      "XTR",
      [{ label: "Rolka Pro", amount: getPlanPriceStars("PRO") }]
    );
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    if (ctx.from?.id) {
      const payload = ctx.message.successful_payment.invoice_payload;
      const plan = payload.includes("PRO") ? "PRO" : "PLUS";
      const profile = getUserProfile(ctx.from.id);
      profile.plan = plan;
      profile.subscriptionEndsAt = addDays(new Date(), 30);
      await deps.syncTelegramUser(ctx.from);
      await deps.recordSuccessfulPayment(
        ctx.from.id,
        plan,
        ctx.message.successful_payment.telegram_payment_charge_id,
        payload
      );
    }
    await ctx.reply("✅ <b>Подписка активирована.</b>\n\nЛимиты обновлены в текущей Telegram-сессии.", {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });
}
