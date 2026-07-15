import { validateAdultCharacters } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { clearBotSession } from "@/server/services/bot-session-service";
import { createChatForUser } from "@/server/services/chat-service";
import { Bot, InlineKeyboard } from "grammy";
import { generatedAiCharacter, onboardingCharacters, sampleUserProfiles } from "../catalog";
import {
  adultChatKeyboard,
  chatAiCharacterKeyboard,
  chatConfirmKeyboard,
  chatContextAwaitingKeyboard,
  chatModeStepKeyboard,
  chatReadyKeyboard,
  chatUserProfileKeyboard,
  contextSavedKeyboard,
  mainMenuKeyboard,
  newChatKeyboard,
  onboardingCharacterKeyboard,
  onboardingFirstMessageKeyboard,
  onboardingGoalKeyboard,
  onboardingStyleKeyboard,
  savedCharactersKeyboard,
  savedUserProfilesKeyboard,
  sceneBriefInputKeyboard,
  sceneBriefSavedKeyboard,
  subscriptionKeyboard,
  userProfileInputKeyboard
} from "../keyboards";
import { getChatState, getUserProfile, persistRuntimeSession, resetChatState } from "../sessions";
import {
  adultChatText,
  chatConfirmText,
  chatContextHaveText,
  chatLimitText,
  chatModeStepText,
  chatReadyText,
  chatUserProfileText,
  contextSavedText,
  newChatText,
  onboardingCharacterText,
  onboardingFirstMessageText,
  onboardingGoalText,
  onboardingHowText,
  onboardingStarterSceneText,
  onboardingStyleText,
  onboardingWriteSelfText,
  savedCharactersText,
  savedUserProfilesText,
  sceneBriefInputText,
  sceneBriefSavedText,
  userProfileTemplateText
} from "../texts";
import type { ChatDraft, TelegramFrom, UserRuntimeProfile } from "../types";
import { buildImportedContext, confirmAdult, escapeHtml, freeChatLimit, isAdultConfirmed, mapMode } from "../utils";
import { findSavedCharacter, nextGeneratedCharacter, persistCharacterForTelegramUser, renderUserProfileFromCharacter } from "./characters";
import { buildSavedChatTitle } from "./saved-chats";

type NewChatFlowDeps = {
  syncTelegramUser: (from: TelegramFrom) => Promise<unknown>;
};

type NewChatReply = (text: string, keyboard: InlineKeyboard) => Promise<void>;

export function registerNewChatFlow(bot: Bot, deps: NewChatFlowDeps) {
  bot.callbackQuery("onboarding_start", async (ctx) => {
    await ctx.answerCallbackQuery();
    resetChatState(ctx.from.id);
    await ctx.editMessageText(onboardingGoalText(), {
      parse_mode: "HTML",
      reply_markup: onboardingGoalKeyboard()
    });
  });

  bot.callbackQuery("onboarding_how", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(onboardingHowText(), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🎭 Начать обучение", "onboarding_start")
    });
  });

  bot.callbackQuery(/^onboarding_goal:/, async (ctx) => {
    await ctx.answerCallbackQuery("Сценарий выбран");
    const goal = ctx.callbackQuery.data.replace("onboarding_goal:", "");
    applyOnboardingGoal(getChatState(ctx.from.id), goal);
    await ctx.editMessageText(onboardingCharacterText(), {
      parse_mode: "HTML",
      reply_markup: onboardingCharacterKeyboard()
    });
  });

  bot.callbackQuery(/^onboarding_character:/, async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж выбран");
    const id = ctx.callbackQuery.data.replace("onboarding_character:", "");
    getChatState(ctx.from.id).aiCharacter = onboardingCharacters[id] ?? generatedAiCharacter;
    await ctx.editMessageText(onboardingStyleText(), {
      parse_mode: "HTML",
      reply_markup: onboardingStyleKeyboard()
    });
  });

  bot.callbackQuery("onboarding_character_generate", async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж подобран");
    getChatState(ctx.from.id).aiCharacter = nextGeneratedCharacter(ctx.from.id);
    await ctx.editMessageText(onboardingStyleText(), {
      parse_mode: "HTML",
      reply_markup: onboardingStyleKeyboard()
    });
  });

  bot.callbackQuery(/^onboarding_style:/, async (ctx) => {
    await ctx.answerCallbackQuery("Стиль выбран");
    const style = ctx.callbackQuery.data.replace("onboarding_style:", "");
    const state = getChatState(ctx.from.id);
    state.mode = mapMode(style);
    await ctx.editMessageText(onboardingFirstMessageText(state), {
      parse_mode: "HTML",
      reply_markup: onboardingFirstMessageKeyboard()
    });
  });

  bot.callbackQuery("onboarding_write_self", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(onboardingWriteSelfText(), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery("onboarding_starter_scene", async (ctx) => {
    await ctx.answerCallbackQuery("Сцена готова");
    const state = getChatState(ctx.from.id);
    state.context = state.aiCharacter?.starterScene ?? generatedAiCharacter.starterScene ?? undefined;
    await ctx.editMessageText(onboardingStarterSceneText(state), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery("new_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const previousMode = getChatState(ctx.from.id).mode;
    resetChatState(ctx.from.id);
    await clearBotSession(ctx.from.id);
    if (previousMode) getChatState(ctx.from.id).mode = previousMode;
    await ctx.editMessageText(newChatText(), {
      parse_mode: "HTML",
      reply_markup: newChatKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_context_step", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatUserProfileText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatUserProfileKeyboard()
    });
  });

  bot.callbackQuery("continue_old_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const previousMode = getChatState(ctx.from.id).mode;
    resetChatState(ctx.from.id);
    if (previousMode) getChatState(ctx.from.id).mode = previousMode;
    getChatState(ctx.from.id).awaiting = "context";
    await ctx.editMessageText(chatContextHaveText(), {
      parse_mode: "HTML",
      reply_markup: chatContextAwaitingKeyboard()
    });
  });

  bot.callbackQuery("chat_context_have", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "context";
    await ctx.editMessageText(chatContextHaveText(), {
      parse_mode: "HTML",
      reply_markup: chatContextAwaitingKeyboard()
    });
  });

  bot.callbackQuery("chat_context_skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatUserProfileText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatUserProfileKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatUserProfileText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatUserProfileKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_template", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "userProfile";
    await ctx.editMessageText(userProfileTemplateText(), {
      parse_mode: "HTML",
      reply_markup: userProfileInputKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_saved", async (ctx) => {
    await ctx.answerCallbackQuery();
    await deps.syncTelegramUser(ctx.from);
    await ctx.editMessageText(savedUserProfilesText(), {
      parse_mode: "HTML",
      reply_markup: savedUserProfilesKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery(/^chat_user_profile_pick:/, async (ctx) => {
    await ctx.answerCallbackQuery("Твоя роль выбрана");
    const name = ctx.callbackQuery.data.replace("chat_user_profile_pick:", "");
    const state = getChatState(ctx.from.id);
    const character = findSavedCharacter(ctx.from.id, name);
    state.userProfileName = character?.name ?? name;
    state.userProfile = character ? renderUserProfileFromCharacter(character) : sampleUserProfiles[name] ?? `Моя роль: ${name}`;
    state.awaiting = null;
    await ctx.editMessageText(savedCharactersText(state), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_user_profile_skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    state.awaiting = null;
    await ctx.editMessageText(savedCharactersText(state), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("scene_brief_write", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "sceneBrief";
    await ctx.editMessageText(sceneBriefInputText(), {
      parse_mode: "HTML",
      reply_markup: sceneBriefInputKeyboard()
    });
  });

  bot.callbackQuery("scene_brief_skip", async (ctx) => {
    await ctx.answerCallbackQuery("Пропущено");
    const state = getChatState(ctx.from.id);
    state.sceneBrief = undefined;
    state.awaiting = null;
    await ctx.editMessageText(chatModeStepText(state), {
      parse_mode: "HTML",
      reply_markup: chatModeStepKeyboard()
    });
  });

  bot.callbackQuery("chat_mode_step", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    state.awaiting = null;
    await ctx.editMessageText(chatModeStepText(state), {
      parse_mode: "HTML",
      reply_markup: chatModeStepKeyboard()
    });
  });

  bot.callbackQuery(/^chat_mode:/, async (ctx) => {
    await ctx.answerCallbackQuery("Режим выбран");
    const mode = ctx.callbackQuery.data.replace("chat_mode:", "");
    const state = getChatState(ctx.from.id);
    state.mode = mapMode(mode);
    state.awaiting = null;
    await ctx.editMessageText(chatConfirmText(state), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery("chat_start_confirmed", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    const profile = getUserProfile(ctx.from.id);
    if (state.active && state.activeChatId) {
      await ctx.editMessageText(chatReadyText(state), {
        parse_mode: "HTML",
        reply_markup: chatReadyKeyboard()
      });
      return;
    }
    const startCheck = canStartChat(profile, state);
    if (!startCheck.ok) {
      await ctx.editMessageText(startCheck.message, {
        parse_mode: "HTML",
        reply_markup: startCheck.keyboard
      });
      return;
    }

    const completedOnboardingNow = !profile.onboardingCompleted;
    try {
      const aiCharacter = await persistCharacterForTelegramUser(ctx.from.id, state.aiCharacter ?? generatedAiCharacter);
      const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
      if (!user) throw new Error("USER_NOT_FOUND");
      state.mode ??= "CLASSIC";
      state.aiCharacter = aiCharacter;
      const chat = await createChatForUser(user.id, {
        title: buildSavedChatTitle(state, new Date()),
        mode: state.mode,
        characterIds: [aiCharacter.id],
        lorebook: state.userProfile,
        memorySummary: state.sceneBrief,
        importedContext: buildImportedContext(state)
      });
      state.activeChatId = chat.id;
      state.active = true;
      state.awaiting = null;
      profile.chatsStarted = await countUserChats(user.id);
      profile.onboardingCompleted = true;
      if (completedOnboardingNow) await markOnboardingCompleted(ctx.from.id);
      await persistRuntimeSession(ctx.from.id, state, user.id);
      await ctx.editMessageText(chatReadyText(state, completedOnboardingNow), {
        parse_mode: "HTML",
        reply_markup: chatReadyKeyboard()
      });
    } catch (error) {
      await ctx.editMessageText(error instanceof Error ? escapeHtml(error.message) : "Не удалось начать ролку.", {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard()
      });
    }
  });

  bot.callbackQuery("adult_gate_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const profile = getUserProfile(ctx.from.id);
    if (isAdultConfirmed(profile)) {
      const state = getChatState(ctx.from.id);
      state.mode = "ADULT";
      state.awaiting = null;
      await ctx.editMessageText(chatConfirmText(state), {
        parse_mode: "HTML",
        reply_markup: chatConfirmKeyboard()
      });
      return;
    }
    await ctx.editMessageText(adultChatText(), {
      parse_mode: "HTML",
      reply_markup: adultChatKeyboard()
    });
  });

  bot.callbackQuery("adult_accept_chat", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    await deps.syncTelegramUser(ctx.from);
    await confirmAdult(getUserProfile(ctx.from.id), ctx.from.id);
    const state = getChatState(ctx.from.id);
    state.mode = "ADULT";
    state.awaiting = null;
    await ctx.editMessageText(chatConfirmText(state), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });
}

export async function handleNewChatAwaitingInput(
  userId: number,
  content: string,
  reply: NewChatReply
): Promise<boolean> {
  const state = getChatState(userId);
  if (state.awaiting === "context") {
    state.context = content;
    state.awaiting = null;
    await reply(contextSavedText(state), contextSavedKeyboard());
    return true;
  }

  if (state.awaiting === "userProfile") {
    state.userProfile = content;
    state.userProfileName = "анкета вручную";
    state.awaiting = null;
    await reply(savedCharactersText(state), savedCharactersKeyboard(userId));
    return true;
  }

  if (state.awaiting === "sceneBrief") {
    state.sceneBrief = content;
    state.awaiting = null;
    await reply(sceneBriefSavedText(state), sceneBriefSavedKeyboard());
    return true;
  }

  return false;
}

function applyOnboardingGoal(state: ChatDraft, goal: string) {
  state.awaiting = null;
  state.active = false;
  if (goal === "slow") {
    state.mode = "SLOW_BURN";
    state.aiCharacter = onboardingCharacters.ally;
    state.context = "Первая сцена строится вокруг медленного сближения, недосказанности и маленьких шагов доверия.";
    return;
  }
  if (goal === "dark") {
    state.mode = "DARK_DRAMA";
    state.aiCharacter = onboardingCharacters.patron;
    state.context = "Первая сцена строится вокруг напряжения, тайны и сложного выбора, но остается в рамках правил.";
    return;
  }
  if (goal === "adventure") {
    state.mode = "ADVENTURE_GM";
    state.aiCharacter = onboardingCharacters.gm;
    state.context = "Первая сцена строится вокруг приключения: локация, улика, выбор и последствия.";
    return;
  }
  state.mode = "CLASSIC";
  state.aiCharacter = generatedAiCharacter;
  state.context = undefined;
}

function canStartChat(profile: UserRuntimeProfile, state: ChatDraft) {
  if (profile.plan === "FREE" && profile.chatsStarted >= freeChatLimit()) {
    return { ok: false as const, message: chatLimitText(profile), keyboard: subscriptionKeyboard() };
  }

  if (state.mode === "ADULT") {
    if (!isAdultConfirmed(profile)) {
      return { ok: false as const, message: adultChatText(), keyboard: adultChatKeyboard() };
    }
    const adultSafety = validateAdultCharacters("ADULT", [state.aiCharacter ?? generatedAiCharacter]);
    if (!adultSafety.ok) {
      return {
        ok: false as const,
        message: `🔞 <b>18+ чат нельзя начать.</b>\n\n${escapeHtml(adultSafety.reason)}\n\nВыбери персонажа 18+ или поправь анкету.`,
        keyboard: chatAiCharacterKeyboard()
      };
    }
  }

  return { ok: true as const };
}

async function countUserChats(userId: string) {
  return prisma.chat.count({ where: { userId, status: { not: "DELETED" }, messages: { some: {} } } });
}

async function markOnboardingCompleted(telegramUserId: number) {
  const completedAt = new Date();
  await prisma.user.updateMany({
    where: { telegramId: String(telegramUserId), onboardingCompleted: false },
    data: { onboardingCompleted: true, onboardingCompletedAt: completedAt }
  });
}
