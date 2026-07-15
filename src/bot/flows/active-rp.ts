import { buildPrompt } from "@/domain/prompts";
import { createConfiguredTextProviders, generateWithFallback } from "@/domain/providers";
import { detectAdultIntentOutsideAdultMode, validateSafetyText } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { clearBotSession } from "@/server/services/bot-session-service";
import { appendChatMessage } from "@/server/services/chat-service";
import { Bot, InlineKeyboard } from "grammy";
import { generatedAiCharacter } from "../catalog";
import {
  adultKeyboard,
  backKeyboard,
  chatReadyKeyboard,
  chatsKeyboard,
  confirmDeleteActiveChatKeyboard,
  confirmSaveAndExitKeyboard,
  confirmStopChatKeyboard,
  mainMenuKeyboard,
  modeSelectedKeyboard,
  modesKeyboard,
  nonAdultModeRedirectKeyboard,
  stoppedChatKeyboard,
  subscriptionKeyboard,
  valueCheckpointKeyboard
} from "../keyboards";
import { getChatState, getUserProfile, persistRuntimeSession, resetChatState } from "../sessions";
import {
  activeChatDeletedText,
  adultAlreadyConfirmedText,
  adultLimitText,
  adultText,
  chatReadyText,
  chatSavedAndExitedText,
  confirmDeleteActiveChatText,
  confirmSaveAndExitText,
  confirmStopChatText,
  contextText,
  imageText,
  modeSelectedText,
  modesText,
  nonAdultModeRedirectText,
  profileText,
  rulesText,
  stopText,
  valueCheckpointText
} from "../texts";
import type { TelegramFrom } from "../types";
import {
  buildImportedContext,
  clampTelegramText,
  confirmAdult,
  freeAdultMessageLimit,
  isAdultConfirmed,
  mapMode
} from "../utils";
import { deletePersistedChat, saveCurrentChat } from "./saved-chats";

type AwaitingReply = (text: string, keyboard: InlineKeyboard) => Promise<void>;

type ActiveRpFlowDeps = {
  handleAwaitingInput: (userId: number, content: string, reply: AwaitingReply) => Promise<boolean>;
  syncTelegramUser: (from: TelegramFrom) => Promise<unknown>;
};

export function registerActiveRpFlow(bot: Bot, deps: ActiveRpFlowDeps) {
  bot.command("stop", async (ctx) => {
    if (!ctx.from?.id) return;
    const state = getChatState(ctx.from.id);
    if (!state.active) {
      await ctx.reply("Активного RP-чата сейчас нет.", {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard()
      });
      return;
    }
    state.active = false;
    state.awaiting = null;
    await ctx.reply(stopText(state), {
      parse_mode: "HTML",
      reply_markup: chatReadyKeyboard()
    });
  });

  bot.callbackQuery("stop_active_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(confirmStopChatText(state), {
      parse_mode: "HTML",
      reply_markup: confirmStopChatKeyboard()
    });
  });

  bot.callbackQuery("confirm_stop_active_chat", async (ctx) => {
    await ctx.answerCallbackQuery("Ролка остановлена");
    const state = getChatState(ctx.from.id);
    state.active = false;
    state.awaiting = null;
    await persistRuntimeSession(ctx.from.id, state);
    await ctx.editMessageText(stopText(state), {
      parse_mode: "HTML",
      reply_markup: stoppedChatKeyboard()
    });
  });

  bot.callbackQuery("cancel_exit_active_chat", async (ctx) => {
    await ctx.answerCallbackQuery("Продолжаем ролку");
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(chatReadyText(state), {
      parse_mode: "HTML",
      reply_markup: chatReadyKeyboard()
    });
  });

  bot.callbackQuery("memory_save", async (ctx) => {
    await ctx.answerCallbackQuery("Сводка собрана");
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(contextText(state), {
      parse_mode: "HTML",
      reply_markup: chatReadyKeyboard()
    });
  });

  bot.callbackQuery("continue_free", async (ctx) => {
    await ctx.answerCallbackQuery("Продолжаем бесплатно");
  });

  bot.callbackQuery("context_export", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(contextText(state), {
      parse_mode: "HTML",
      reply_markup: state.active ? chatReadyKeyboard() : backKeyboard()
    });
  });

  bot.callbackQuery("rp_modes", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(modesText(), {
      parse_mode: "HTML",
      reply_markup: modesKeyboard()
    });
  });

  bot.callbackQuery(/^mode:/, async (ctx) => {
    await ctx.answerCallbackQuery("Режим выбран");
    const mode = ctx.callbackQuery.data.replace("mode:", "");
    const state = getChatState(ctx.from.id);
    state.mode = mapMode(mode);
    state.awaiting = null;
    await ctx.reply(modeSelectedText(state.mode), {
      parse_mode: "HTML",
      reply_markup: modeSelectedKeyboard()
    });
  });

  bot.callbackQuery("image_mode", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(imageText(), {
      parse_mode: "HTML",
      reply_markup: state.active ? chatReadyKeyboard() : backKeyboard()
    });
  });

  bot.callbackQuery("save_and_exit", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(confirmSaveAndExitText(state), {
      parse_mode: "HTML",
      reply_markup: confirmSaveAndExitKeyboard()
    });
  });

  bot.callbackQuery("confirm_save_and_exit", async (ctx) => {
    await ctx.answerCallbackQuery("Чат сохранен");
    const state = getChatState(ctx.from.id);
    const saved = await saveCurrentChat(ctx.from.id, state);
    state.active = false;
    state.awaiting = null;
    state.messages = [];
    state.activeChatId = undefined;
    await clearBotSession(ctx.from.id);
    await ctx.editMessageText(chatSavedAndExitedText(saved), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("delete_active_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(confirmDeleteActiveChatText(state), {
      parse_mode: "HTML",
      reply_markup: confirmDeleteActiveChatKeyboard()
    });
  });

  bot.callbackQuery("confirm_delete_active_chat", async (ctx) => {
    await ctx.answerCallbackQuery("Чат удален");
    const state = getChatState(ctx.from.id);
    if (state.activeChatId) await deletePersistedChat(ctx.from.id, state.activeChatId);
    resetChatState(ctx.from.id);
    await clearBotSession(ctx.from.id);
    await ctx.editMessageText(activeChatDeletedText(), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.callbackQuery("adult_gate", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    if (isAdultConfirmed(getUserProfile(ctx.from.id))) {
      await ctx.editMessageText(adultAlreadyConfirmedText(), {
        parse_mode: "HTML",
        reply_markup: backKeyboard()
      });
      return;
    }
    await ctx.editMessageText(adultText(), {
      parse_mode: "HTML",
      reply_markup: adultKeyboard()
    });
  });

  bot.callbackQuery("adult_accept", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    await deps.syncTelegramUser(ctx.from);
    await confirmAdult(getUserProfile(ctx.from.id), ctx.from.id);
    await ctx.reply(
      "✅ <b>Возраст и согласие отмечены.</b>\n\n18+ режим доступен для взрослых вымышленных персонажей. Запрещенные категории все равно блокируются safety-фильтром.",
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() }
    );
  });

  bot.callbackQuery("rules", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(rulesText(), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(profileText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("cabinet", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(profileText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (!ctx.from?.id) return;
    await deps.syncTelegramUser(ctx.from);
    const state = getChatState(ctx.from.id);
    if (state.awaiting) {
      await deps.handleAwaitingInput(ctx.from.id, ctx.message.text, async (text, keyboard) => {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      });
      await persistRuntimeSession(ctx.from.id, getChatState(ctx.from.id));
      return;
    }
    if (state.active) {
      await handleActiveChatMessage(ctx.from.id, ctx.chat.id, ctx.message.text, async (action) => {
        await ctx.api.sendChatAction(ctx.chat.id, action);
      }, async (text, keyboard) => {
        await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
      });
      return;
    }
      await ctx.reply("Сейчас нет активного RP-чата. Нажми «Новый чат», чтобы начать.", {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });
}

async function handleActiveChatMessage(
  userId: number,
  chatId: number,
  content: string,
  sendAction: (action: "typing") => Promise<void>,
  reply: (text: string, keyboard?: InlineKeyboard) => Promise<void>
) {
  const state = getChatState(userId);
  const profile = getUserProfile(userId);
  const safety = validateSafetyText(content);
  if (!safety.ok) {
    await reply(`Сообщение заблокировано safety-фильтром: ${safety.reason}`, chatReadyKeyboard());
    return;
  }
  const adultIntent = detectAdultIntentOutsideAdultMode(content, state.mode ?? "CLASSIC");
  if (!adultIntent.ok) {
    const redirectText = nonAdultModeRedirectText(state);
    state.messages.push({ role: "user", content });
    state.messages.push({ role: "assistant", content: redirectText });
    const user = state.activeChatId ? await prisma.user.findUnique({ where: { telegramId: String(userId) } }) : null;
    if (user && state.activeChatId) {
      await appendChatMessage({ userId: user.id, chatId: state.activeChatId, role: "user", content });
      await appendChatMessage({ userId: user.id, chatId: state.activeChatId, role: "assistant", content: redirectText });
      await prisma.chat.update({ where: { id: state.activeChatId }, data: { updatedAt: new Date() } });
    }
    await persistRuntimeSession(userId, state, user?.id);
    await reply(redirectText, nonAdultModeRedirectKeyboard());
    return;
  }
  if (state.mode === "ADULT" && profile.plan === "FREE" && profile.adultMessages >= freeAdultMessageLimit()) {
    await reply(adultLimitText(profile), subscriptionKeyboard());
    return;
  }

  state.messages.push({ role: "user", content });
  let persistedUserMessageId: string | undefined;
  const user = state.activeChatId ? await prisma.user.findUnique({ where: { telegramId: String(userId) } }) : null;
  if (user && state.activeChatId) {
    const persistedUserMessage = await appendChatMessage({ userId: user.id, chatId: state.activeChatId, role: "user", content });
    persistedUserMessageId = persistedUserMessage.id;
  }
  await sendAction("typing");

  try {
    const prompt = buildPrompt({
      mode: state.mode ?? "CLASSIC",
      characters: [state.aiCharacter ?? generatedAiCharacter],
      importedContext: buildImportedContext(state),
      recentMessages: state.messages.slice(-20)
    });
    const response = await generateWithFallback(createConfiguredTextProviders(), {
      messages: prompt,
      temperature: 0.82
    });
    const answer = clampTelegramText(response.content || "Пустой ответ от модели. Попробуй отправить сообщение еще раз.");
    state.messages.push({ role: "assistant", content: answer });
    if (user && state.activeChatId) {
      await appendChatMessage({
        userId: user.id,
        chatId: state.activeChatId,
        role: "assistant",
        content: answer,
        provider: response.provider,
        model: response.model
      });
      await prisma.chat.update({
        where: { id: state.activeChatId },
        data: {
          updatedAt: new Date(),
          adultMessageCount: state.mode === "ADULT" ? { increment: 1 } : undefined
        }
      });
    }
    if (state.mode === "ADULT") profile.adultMessages += 1;
    await persistRuntimeSession(userId, state, user?.id);
    const shouldShowCheckpoint =
      profile.plan === "FREE" && !profile.onboardingMessagesShown && state.messages.length >= 6;
    if (shouldShowCheckpoint) {
      profile.onboardingMessagesShown = true;
      await markValueCheckpointShown(userId);
      await reply(`${answer}\n\n${valueCheckpointText()}`, valueCheckpointKeyboard());
      return;
    }
    await reply(answer, chatReadyKeyboard());
  } catch (error) {
    console.error("AI chat failed", { chatId, error });
    state.messages.pop();
    if (persistedUserMessageId) {
      await prisma.message.deleteMany({ where: { id: persistedUserMessageId } });
    }
    await persistRuntimeSession(userId, state, user?.id);
    await reply(
      "Не получилось получить ответ от AI API. AITUNNEL иногда отвечает с задержкой или timeout. Попробуй еще раз через несколько секунд.",
      chatReadyKeyboard()
    );
  }
}

async function markValueCheckpointShown(telegramUserId: number) {
  await prisma.user.updateMany({
    where: { telegramId: String(telegramUserId), valueCheckpointShownAt: null },
    data: { valueCheckpointShownAt: new Date() }
  });
}
