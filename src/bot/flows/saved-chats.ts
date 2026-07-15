import { prisma } from "@/lib/prisma";
import { Bot } from "grammy";
import { generatedAiCharacter } from "../catalog";
import {
  chatConfirmKeyboard,
  chatsKeyboard,
  deleteChatKeyboard,
  savedChatKeyboard
} from "../keyboards";
import { chatStates, getChatState, getUserProfile } from "../sessions";
import {
  chatsText,
  deleteChatText,
  savedChatContextText,
  savedChatContinueText,
  savedChatText
} from "../texts";
import type { ChatDraft, SavedChat, TelegramFrom } from "../types";
import { buildImportedContext, createRuntimeId, formatDateTime } from "../utils";
import { persistCharacterForTelegramUser } from "./characters";

type SavedChatsFlowDeps = {
  syncTelegramUser: (from: TelegramFrom) => Promise<unknown>;
};

export function registerSavedChatsFlow(bot: Bot, deps: SavedChatsFlowDeps) {
  bot.callbackQuery("my_chats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await deps.syncTelegramUser(ctx.from);
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatsText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("delete_chat_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await deps.syncTelegramUser(ctx.from);
    await ctx.editMessageText(deleteChatText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: deleteChatKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery(/^delete_chat:/, async (ctx) => {
    await ctx.answerCallbackQuery("Чат удален");
    const id = ctx.callbackQuery.data.replace("delete_chat:", "");
    const profile = getUserProfile(ctx.from.id);
    await deletePersistedChat(ctx.from.id, id);
    profile.savedChats = profile.savedChats.filter((chat) => chat.id !== id);
    await ctx.editMessageText(chatsText(profile), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery(/^saved_chat:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = ctx.callbackQuery.data.replace("saved_chat:", "");
    const chat = getUserProfile(ctx.from.id).savedChats.find((item) => item.id === id);
    await ctx.editMessageText(savedChatText(chat), {
      parse_mode: "HTML",
      reply_markup: savedChatKeyboard(chat)
    });
  });

  bot.callbackQuery(/^continue_saved_chat:/, async (ctx) => {
    await ctx.answerCallbackQuery("Продолжаем ролку");
    const id = ctx.callbackQuery.data.replace("continue_saved_chat:", "");
    const chat = getUserProfile(ctx.from.id).savedChats.find((item) => item.id === id);
    if (!chat) {
      await ctx.editMessageText(savedChatText(), {
        parse_mode: "HTML",
        reply_markup: chatsKeyboard(ctx.from.id)
      });
      return;
    }
    restoreSavedChat(ctx.from.id, chat);
    await ctx.editMessageText(savedChatContinueText(chat), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery(/^saved_chat_context:/, async (ctx) => {
    await ctx.answerCallbackQuery("Сводка открыта");
    const id = ctx.callbackQuery.data.replace("saved_chat_context:", "");
    const chat = getUserProfile(ctx.from.id).savedChats.find((item) => item.id === id);
    await ctx.editMessageText(savedChatContextText(chat), {
      parse_mode: "HTML",
      reply_markup: savedChatKeyboard(chat)
    });
  });

  bot.callbackQuery(/^delete_saved_chat:/, async (ctx) => {
    await ctx.answerCallbackQuery("Чат удален");
    const id = ctx.callbackQuery.data.replace("delete_saved_chat:", "");
    const profile = getUserProfile(ctx.from.id);
    await deletePersistedChat(ctx.from.id, id);
    profile.savedChats = profile.savedChats.filter((chat) => chat.id !== id);
    await ctx.editMessageText(chatsText(profile), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });
}

export async function saveCurrentChat(userId: number, state: ChatDraft): Promise<SavedChat> {
  const profile = getUserProfile(userId);
  const savedAt = new Date();
  const aiCharacter = await persistCharacterForTelegramUser(userId, state.aiCharacter ?? generatedAiCharacter);
  const user = await prisma.user.findUnique({ where: { telegramId: String(userId) } });
  const title = buildSavedChatTitle(state, savedAt);
  let persistedChatId = state.activeChatId ?? createRuntimeId();

  if (user && state.activeChatId) {
    await prisma.chat.updateMany({
      where: { id: state.activeChatId, userId: user.id },
      data: {
        title,
        mode: state.mode ?? "CLASSIC",
        importedContext: buildImportedContext(state),
        memorySummary: state.sceneBrief,
        lorebook: state.userProfile,
        updatedAt: savedAt
      }
    });
  } else if (user) {
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title,
        mode: state.mode ?? "CLASSIC",
        status: "ACTIVE",
        importedContext: buildImportedContext(state),
        memorySummary: state.sceneBrief,
        lorebook: state.userProfile,
        characters: {
          create: [{ characterId: aiCharacter.id }]
        },
        messages: {
          create: state.messages.map((message) => ({
            userId: user.id,
            role: message.role === "assistant" ? "ASSISTANT" : message.role === "system" ? "SYSTEM" : "USER",
            content: message.content
          }))
        }
      }
    });
    persistedChatId = chat.id;
  }

  const saved: SavedChat = {
    id: persistedChatId,
    title,
    mode: state.mode ?? "CLASSIC",
    aiCharacter,
    aiCharacterName: aiCharacter.name,
    savedAt,
    messages: [...state.messages],
    context: state.context,
    sceneBrief: state.sceneBrief,
    userProfile: state.userProfile
  };
  profile.savedChats.unshift(saved);
  return saved;
}

export async function deletePersistedChat(telegramUserId: number, chatId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramUserId) } });
  if (!user) return;
  await prisma.chat.updateMany({
    where: { id: chatId, userId: user.id },
    data: { status: "DELETED" }
  });
}

export function restoreSavedChat(userId: number, chat: SavedChat) {
  const state: ChatDraft = {
    awaiting: null,
    active: false,
    context: buildSavedChatImportedContext(chat),
    sceneBrief: chat.sceneBrief,
    userProfile: chat.userProfile,
    userProfileName: chat.userProfile ? "сохраненная роль" : undefined,
    aiCharacter: chat.aiCharacter ?? {
      ...generatedAiCharacter,
      name: chat.aiCharacterName,
      description: `Сохраненный персонаж AI: ${chat.aiCharacterName}`
    },
    mode: chat.mode,
    messages: [...chat.messages]
  };
  chatStates.set(userId, state);
  return state;
}

export function buildSavedChatTitle(state: ChatDraft, savedAt: Date) {
  const character = state.aiCharacter?.name ?? generatedAiCharacter.name;
  return `${character} В· ${formatDateTime(savedAt)}`;
}

function buildSavedChatImportedContext(chat: SavedChat) {
  const transcript = chat.messages
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Пользователь" : "AI"}: ${message.content}`)
    .join("\n\n");
  return [
    chat.context ? `Старый контекст:\n${chat.context}` : null,
    chat.sceneBrief ? `Замысел сцены:\n${chat.sceneBrief}` : null,
    transcript ? `Последние сообщения сохраненной ролки:\n${transcript}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}
