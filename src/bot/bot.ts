import { Bot, InlineKeyboard } from "grammy";
import { getPlanPriceStars, PLAN_LIMITS, type Plan } from "@/domain/plans";
import { buildPrompt, type PromptCharacter, type PromptMessage } from "@/domain/prompts";
import { createConfiguredTextProviders, generateWithFallback } from "@/domain/providers";
import { detectAdultIntentOutsideAdultMode, validateAdultCharacters, validateSafetyText } from "@/domain/safety";
import type { RpMode } from "@/domain/modes";
import { prisma } from "@/lib/prisma";

const token = process.env.TELEGRAM_BOT_TOKEN;

const configuredAdminTelegramIds = new Set(
  (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

type AwaitingInput =
  | "context"
  | "sceneBrief"
  | "userProfile"
  | "aiCharacter"
  | "libraryCharacter"
  | "chatAiCharacter"
  | "chatUserCharacter"
  | "adminAddAdmin"
  | null;

type SavedCharacter = PromptCharacter & {
  id: string;
};

type SavedChat = {
  id: string;
  title: string;
  mode: RpMode;
  aiCharacter?: PromptCharacter;
  aiCharacterName: string;
  savedAt: Date;
  messages: PromptMessage[];
  context?: string;
  sceneBrief?: string;
  userProfile?: string;
};

type UserRuntimeProfile = {
  plan: Plan;
  isAdmin: boolean;
  registeredAt: Date;
  subscriptionEndsAt?: Date;
  onboardingCompleted: boolean;
  onboardingMessagesShown: boolean;
  generatedCharacterVariantIndex: number;
  ageVerifiedAt?: Date;
  termsAcceptedAt?: Date;
  privacyAcceptedAt?: Date;
  characters: SavedCharacter[];
  savedChats: SavedChat[];
  chatsStarted: number;
  adultMessages: number;
};

type ChatDraft = {
  awaiting: AwaitingInput;
  context?: string;
  sceneBrief?: string;
  userProfile?: string;
  userProfileName?: string;
  aiCharacter?: PromptCharacter;
  mode?: RpMode;
  active: boolean;
  messages: PromptMessage[];
};

const chatStates = new Map<number, ChatDraft>();
const userProfiles = new Map<number, UserRuntimeProfile>();

const sampleUserProfiles: Record<string, string> = {
  Mira: "Моя роль: Мира, 24 года. Сдержанная, внимательная, говорит коротко, не любит давление, держит дистанцию, но быстро считывает настроение собеседника.",
  Noah: "Моя роль: Ной, 31 год. Спокойный, ироничный, прямой в разговоре, не любит игры в молчанку, привык сначала наблюдать, потом действовать."
};

const sampleAiCharacters: Record<string, PromptCharacter> = {
  Mira: {
    name: "Mira",
    age: 24,
    description: "Сдержанная собеседница с сильным характером и собственными границами.",
    personality: "Наблюдательная, самостоятельная, не соглашается автоматически, умеет мягко спорить.",
    speechStyle: "Короткие живые реплики, спокойная ирония, без пафоса.",
    boundaries: "Не possessive, не контролирующая, не решает за персонажа пользователя."
  },
  Noah: {
    name: "Noah",
    age: 31,
    description: "Взрослый персонаж с сухим юмором, привычкой держать контроль над собой и не давить без причины.",
    personality: "Терпеливый, упрямый, с личными мотивами и границами.",
    speechStyle: "Прямые фразы, спокойная уверенность, иногда грубоватый юмор.",
    boundaries: "Не навязчивый, не одержимый, уважает действия пользователя."
  }
};

const generatedAiCharacter: PromptCharacter = {
  name: "Элиан Вейр",
  age: 27,
  description: "Харизматичный незнакомец с собственной тайной и спокойной манерой держаться.",
  personality: "Внимательный, независимый, не торопится сближаться, умеет спорить и отказывать.",
  speechStyle: "Живые короткие реплики, мягкая ирония, без литературного пафоса.",
  boundaries: "Не possessive, не контролирующий, без одержимости без сюжетной причины.",
  starterScene: "Он оказывается рядом в момент, когда разговор уже нельзя отложить, но не пытается решить все за пользователя."
};

const generatedAiCharacterVariants: PromptCharacter[] = [
  generatedAiCharacter,
  {
    name: "Кай Рендалл",
    age: 32,
    description: "Бывший союзник, который вернулся не вовремя и явно принес с собой старую проблему.",
    personality: "Прямой, упрямый, сдерживает эмоции, но слишком хорошо помнит прошлое.",
    speechStyle: "Короткие фразы, сухая ирония, паузы вместо признаний.",
    boundaries: "Не решает за пользователя, не давит романтикой, уважает отказ и границы.",
    starterScene: "Он стоит у выхода, будто собирался уйти, но замирает, когда видит тебя."
  },
  {
    name: "Селена Мар",
    age: 28,
    description: "Умная и опасно спокойная покровительница, которая предлагает помощь с условиями.",
    personality: "Наблюдательная, расчетливая, умеет быть мягкой, когда это выгодно.",
    speechStyle: "Точные спокойные реплики, минимум лишних слов, уверенный тон.",
    boundaries: "Без принуждения и запрещенного контента; напряжение остается сюжетным.",
    starterScene: "Она кладет перед тобой конверт и говорит, что времени на сомнения почти не осталось."
  },
  {
    name: "Роуэн",
    age: 30,
    description: "Проводник по странному месту, где каждое решение оставляет след.",
    personality: "Практичный, внимательный к деталям, не раскрывает все сразу.",
    speechStyle: "Ясные фразы, конкретные детали, легкая настороженность.",
    boundaries: "Сохраняет агентность пользователя и не выбирает действия за него.",
    starterScene: "Карта в его руках меняется прямо на глазах, будто место само решает, кого пустить дальше."
  }
];

const onboardingCharacters: Record<string, PromptCharacter> = {
  stranger: {
    name: "Таинственный незнакомец",
    age: 27,
    description: "Спокойный незнакомец с тайной, который появляется в сцене так, будто знает больше, чем говорит.",
    personality: "Внимательный, сдержанный, не спешит сближаться, умеет отвечать с подтекстом.",
    speechStyle: "Короткие живые реплики, мягкая ирония, спокойный темп.",
    boundaries: "Не решает за пользователя, не давит, не становится одержимым без сюжетной причины.",
    starterScene: "Ты замечаешь его у окна: он будто ждал именно тебя, но первым делом только кивает на свободное место напротив."
  },
  ally: {
    name: "Бывший союзник",
    age: 29,
    description: "Человек из прошлого, с которым остались недоговоренности, старое доверие и напряжение.",
    personality: "Прямой, упрямый, помнит детали прошлого, не прощает слишком быстро.",
    speechStyle: "Сдержанные фразы, паузы, иногда сухая насмешка.",
    boundaries: "Не навязывает чувства, уважает выбор пользователя, конфликт держит в рамках сцены.",
    starterScene: "Дверь закрывается за твоей спиной, и он поднимает взгляд: похоже, этот разговор вы оба откладывали слишком долго."
  },
  patron: {
    name: "Опасный покровитель",
    age: 34,
    description: "Влиятельный взрослый персонаж с ресурсами, условиями и собственным интересом к сцене.",
    personality: "Уверенный, расчетливый, внимательный к слабым местам, но не карикатурно жестокий.",
    speechStyle: "Спокойные точные фразы, контроль тона, минимум лишних слов.",
    boundaries: "Без принуждения и запрещенного контента; давление только сюжетное и обратимое.",
    starterScene: "Он предлагает помощь слишком спокойно, и именно поэтому становится ясно: у этой помощи будет цена."
  },
  gm: {
    name: "Мастер приключения",
    age: 30,
    description: "Ведущий мира: локации, NPC, улики, выборы и последствия вокруг персонажа пользователя.",
    personality: "Нейтральный, внимательный к действиям игрока, держит интригу без рельсов.",
    speechStyle: "Ясные сцены, конкретные детали, понятные выборы.",
    boundaries: "Не делает выбор за пользователя, не ломает заданный тон и границы.",
    starterScene: "На стол падает мокрая карта с отметкой места, которого нет ни в одном официальном архиве."
  }
};

export function createBot() {
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is unset");
  }

  const bot = new Bot(token);

  bot.catch((error) => {
    const description = String(error.error);
    if (description.includes("message is not modified") || description.includes("query is too old")) {
      return;
    }
    console.error("Telegram bot error", error.error);
  });

  bot.command("start", async (ctx) => {
    let profile: UserRuntimeProfile | null = null;
    if (ctx.from?.id) {
      profile = getUserProfile(ctx.from.id);
      await syncTelegramUser(ctx.from);
      resetChatState(ctx.from.id);
    }
    await ctx.reply(profile?.onboardingCompleted ? startText(ctx.from?.first_name) : onboardingStartText(ctx.from?.first_name), {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.callbackQuery("start_age_accept", async (ctx) => {
    await ctx.answerCallbackQuery("Возраст подтвержден");
    if (ctx.from?.id) {
      const profile = getUserProfile(ctx.from.id);
      confirmAdult(profile);
      await syncTelegramUser(ctx.from);
      resetChatState(ctx.from.id);
      await ctx.editMessageText(profile.onboardingCompleted ? startText(ctx.from.first_name) : onboardingStartText(ctx.from.first_name), {
        parse_mode: "HTML",
        reply_markup: profile.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
      });
    }
  });

  bot.command("menu", async (ctx) => {
    const profile = ctx.from?.id ? getUserProfile(ctx.from.id) : null;
    if (ctx.from?.id) await syncTelegramUser(ctx.from);
    await ctx.reply(profile?.onboardingCompleted ? "Главное меню Rolka:" : "Сначала пройди короткое обучение — оно займет около минуты.", {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.command("admin", async (ctx) => {
    if (!ctx.from?.id) return;
    await syncTelegramUser(ctx.from);
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.reply(await adminPanelText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.command("help", async (ctx) => {
    const profile = ctx.from?.id ? getUserProfile(ctx.from.id) : null;
    await ctx.reply(helpText(), {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

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

  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    const profile = getUserProfile(ctx.from.id);
    await ctx.editMessageText(profile.onboardingCompleted ? startText(ctx.from.first_name) : onboardingStartText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: profile.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

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
    await syncTelegramUser(ctx.from);
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

  bot.callbackQuery("chat_ai_character", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(savedCharactersText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_ai_character_saved", async (ctx) => {
    await ctx.answerCallbackQuery();
    await syncTelegramUser(ctx.from);
    await ctx.editMessageText(savedCharactersText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_ai_character_custom", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCharacterInput(ctx.from.id, async (text, keyboard) => {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    }, "chatAiCharacter");
  });

  bot.callbackQuery("character_create", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    const target = state.active ? "libraryCharacter" : "chatAiCharacter";
    await startCharacterInput(ctx.from.id, async (text, keyboard) => {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    }, target);
  });

  bot.callbackQuery("library_character_create", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCharacterInput(ctx.from.id, async (text, keyboard) => {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    }, "libraryCharacter");
  });

  bot.callbackQuery("chat_ai_character_create", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCharacterInput(ctx.from.id, async (text, keyboard) => {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    }, "chatAiCharacter");
  });

  bot.callbackQuery("chat_user_character_create", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCharacterInput(ctx.from.id, async (text, keyboard) => {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    }, "chatUserCharacter");
  });

  bot.callbackQuery("chat_ai_character_generate", async (ctx) => {
    await ctx.answerCallbackQuery();
    const character = nextGeneratedCharacter(ctx.from.id);
    await ctx.editMessageText(aiGeneratedCharacterText(character), {
      parse_mode: "HTML",
      reply_markup: aiGeneratedCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character_accept_generated", async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж выбран");
    const state = getChatState(ctx.from.id);
    state.aiCharacter ??= generatedAiCharacter;
    state.awaiting = null;
    await ctx.editMessageText(sceneBriefText(state), {
      parse_mode: "HTML",
      reply_markup: sceneBriefKeyboard()
    });
  });

  bot.callbackQuery(/^chat_ai_character_pick:/, async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж AI выбран");
    const name = ctx.callbackQuery.data.replace("chat_ai_character_pick:", "");
    const state = getChatState(ctx.from.id);
    state.aiCharacter = findSavedCharacter(ctx.from.id, name) ?? sampleAiCharacters[name] ?? generatedAiCharacter;
    state.awaiting = null;
    await ctx.editMessageText(sceneBriefText(state), {
      parse_mode: "HTML",
      reply_markup: sceneBriefKeyboard()
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
    const startCheck = canStartChat(profile, state);
    if (!startCheck.ok) {
      await ctx.editMessageText(startCheck.message, {
        parse_mode: "HTML",
        reply_markup: startCheck.keyboard
      });
      return;
    }
    const completedOnboardingNow = !profile.onboardingCompleted;
    profile.chatsStarted += 1;
    profile.onboardingCompleted = true;
    if (completedOnboardingNow) await markOnboardingCompleted(ctx.from.id);
    state.active = true;
    state.awaiting = null;
    state.mode ??= "CLASSIC";
    state.aiCharacter ??= generatedAiCharacter;
    await ctx.editMessageText(chatReadyText(state, completedOnboardingNow), {
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

  bot.callbackQuery("characters", async (ctx) => {
    await ctx.answerCallbackQuery();
    await syncTelegramUser(ctx.from);
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(charactersText(), {
      parse_mode: "HTML",
      reply_markup: charactersKeyboard()
    });
  });

  bot.callbackQuery("character_template", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(characterTemplateText(), {
      parse_mode: "HTML",
      reply_markup: charactersKeyboard()
    });
  });

  bot.callbackQuery("my_chats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await syncTelegramUser(ctx.from);
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatsText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("delete_chat_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await syncTelegramUser(ctx.from);
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
    resetChatState(ctx.from.id);
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

  bot.callbackQuery("adult_accept", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    confirmAdult(getUserProfile(ctx.from.id));
    await ctx.reply(
      "✅ <b>Возраст и согласие отмечены.</b>\n\n18+ режим доступен для взрослых вымышленных персонажей. Запрещенные категории все равно блокируются safety-фильтром.",
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() }
    );
  });

  bot.callbackQuery("adult_accept_chat", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    confirmAdult(getUserProfile(ctx.from.id));
    const state = getChatState(ctx.from.id);
    state.mode = "ADULT";
    state.awaiting = null;
    await ctx.editMessageText(chatConfirmText(state), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

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
      "Премиум модели, priority queue, long memory, lorebook и больше генераций фото.",
      "SUBSCRIPTION_PRO",
      "XTR",
      [{ label: "Rolka Pro", amount: getPlanPriceStars("PRO") }]
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

  bot.callbackQuery("admin_panel", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await adminPanelText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.callbackQuery("admin_stats", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await adminStatsText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.callbackQuery("admin_users", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    const users = await listAdminUsers();
    await ctx.editMessageText(await adminUsersText(users), {
      parse_mode: "HTML",
      reply_markup: adminUsersKeyboard(users)
    });
  });

  bot.callbackQuery(/^admin_user:/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    const telegramId = ctx.callbackQuery.data.replace("admin_user:", "");
    await ctx.editMessageText(await adminUserText(telegramId), {
      parse_mode: "HTML",
      reply_markup: adminUserKeyboard(telegramId)
    });
  });

  bot.callbackQuery(/^admin_grant:/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    const [, telegramId, plan] = ctx.callbackQuery.data.split(":") as [string, string, Plan];
    await grantPlanByTelegramId(telegramId, plan);
    await ctx.answerCallbackQuery(`Доступ ${plan} выдан`);
    await ctx.editMessageText(await adminUserText(telegramId), {
      parse_mode: "HTML",
      reply_markup: adminUserKeyboard(telegramId)
    });
  });

  bot.callbackQuery("admin_add_admin", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "adminAddAdmin";
    await ctx.editMessageText(adminAddAdminText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
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
      await syncTelegramUser(ctx.from);
      await recordSuccessfulPayment(ctx.from.id, plan, ctx.message.successful_payment.telegram_payment_charge_id, payload);
    }
    await ctx.reply("✅ <b>Подписка активирована.</b>\n\nЛимиты обновлены в текущей Telegram-сессии.", {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    if (!ctx.from?.id) return;
    const state = getChatState(ctx.from.id);
    if (state.awaiting) {
      await saveAwaitingInput(ctx.from.id, ctx.message.text, async (text, keyboard) => {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      });
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

  return bot;
}

const modeButtonLabels: Record<RpMode, string> = {
  CLASSIC: "🎭 Обычная",
  CINEMATIC: "🎬 Киношная",
  DIALOGUE_FOCUS: "💬 Диалоги",
  SLOW_BURN: "❤️ Медленная",
  ADVENTURE_GM: "🧭 Приключение",
  DARK_DRAMA: "🕯 Темная драма",
  ADULT: "🔞 18+",
  PHOTO_SCENE: "🖼 Фото сцены"
};

function modeButtonLabel(mode: RpMode) {
  return modeButtonLabels[mode];
}

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Новая ролка", "new_chat")
    .row()
    .text("🧠 Продолжить старую", "continue_old_chat")
    .row()
    .text("💬 Мои ролки", "my_chats")
    .text("👤 Персонажи", "characters")
    .row()
    .text("⭐ Plus / Pro", "subscription");
}

function backKeyboard() {
  return new InlineKeyboard().text("← Главное меню", "main_menu");
}

function awaitingInputKeyboard(backCallback: string) {
  return new InlineKeyboard().text("← Назад", backCallback).text("← Главное меню", "main_menu");
}

function onboardingStartKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Начать первую ролку", "onboarding_start")
    .row()
    .text("❔ Как это работает", "onboarding_how");
}

function onboardingGoalKeyboard() {
  return new InlineKeyboard()
    .text("❤️ Медленное сближение", "onboarding_goal:slow")
    .row()
    .text("🕯 Темная драма", "onboarding_goal:dark")
    .row()
    .text("🧭 Приключение", "onboarding_goal:adventure")
    .row()
    .text("✍️ Свой персонаж", "onboarding_goal:custom");
}

function onboardingCharacterKeyboard() {
  return new InlineKeyboard()
    .text("🕶 Таинственный незнакомец", "onboarding_character:stranger")
    .row()
    .text("🤝 Бывший союзник", "onboarding_character:ally")
    .row()
    .text("⚜️ Опасный покровитель", "onboarding_character:patron")
    .row()
    .text("🧭 Мастер приключения", "onboarding_character:gm")
    .row()
    .text("✨ Сгенерировать под меня", "onboarding_character_generate");
}

function onboardingStyleKeyboard() {
  return new InlineKeyboard()
    .text(modeButtonLabel("CLASSIC"), "onboarding_style:classic")
    .row()
    .text(modeButtonLabel("SLOW_BURN"), "onboarding_style:slow")
    .row()
    .text(modeButtonLabel("DARK_DRAMA"), "onboarding_style:dark");
}

function onboardingFirstMessageKeyboard() {
  return new InlineKeyboard()
    .text("✍️ Написать самому", "onboarding_write_self")
    .row()
    .text("✨ Дай стартовую сцену", "onboarding_starter_scene");
}

function newChatKeyboard(userId?: number) {
  return savedUserProfilesKeyboard(userId);
}

function chatContextAwaitingKeyboard() {
  return new InlineKeyboard()
    .text("Дальше к персонажу", "chat_ai_character")
    .row()
    .text("Без старого сюжета", "chat_context_skip")
    .text("← Главное меню", "main_menu");
}

function contextSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к моей роли", "chat_user_profile")
    .row()
    .text("Изменить контекст", "chat_context_have")
    .text("← Главное меню", "main_menu");
}

function chatUserProfileKeyboard() {
  return new InlineKeyboard()
    .text("📝 Дать анкету о себе", "chat_user_profile_template")
    .text("🧍 Мои роли", "chat_user_profile_saved")
    .row()
    .text("Пропустить", "chat_user_profile_skip")
    .text("← Назад", "chat_context_step");
}

function userProfileInputKeyboard() {
  return new InlineKeyboard()
    .text("Пропустить выбор", "chat_user_profile_skip")
    .row()
    .text("← Назад к выбору персонажа", "chat_user_profile")
    .text("← Главное меню", "main_menu");
}

function userProfileSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к персонажу AI", "chat_ai_character")
    .row()
    .text("Изменить мою роль", "chat_user_profile")
    .text("← Назад к выбору", "chat_user_profile");
}

function chatAiCharacterKeyboard() {
  return savedCharactersKeyboard();
}

function aiCharacterInputKeyboard() {
  return new InlineKeyboard()
    .text("← Назад к персонажу AI", "chat_ai_character")
    .text("← Главное меню", "main_menu");
}

function aiCharacterSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к замыслу сцены", "scene_brief_skip")
    .row()
    .text("Изменить персонажа AI", "chat_ai_character")
    .text("← Назад к персонажу", "chat_user_profile");
}

function savedCharactersKeyboard(userId?: number) {
  const keyboard = new InlineKeyboard();
  const saved = userId ? getUserProfile(userId).characters : [];
  if (saved.length) {
    saved.slice(0, 8).forEach((character, index) => {
      keyboard.text(character.name, `chat_ai_character_pick:${character.id}`);
      if (index % 2 === 1) keyboard.row();
    });
    keyboard.row();
  }
  return keyboard
    .text("Mira · пример", "chat_ai_character_pick:Mira")
    .text("Noah · пример", "chat_ai_character_pick:Noah")
    .row()
    .text("➕ Создать персонажа", "chat_ai_character_create")
    .row()
    .text("✨ Сгенерировать персонажа", "chat_ai_character_generate")
    .row()
    .text("← Назад", "chat_ai_character");
}

function savedUserProfilesKeyboard(userId?: number) {
  const keyboard = new InlineKeyboard();
  const saved = userId ? getUserProfile(userId).characters : [];
  if (saved.length) {
    saved.slice(0, 8).forEach((character, index) => {
      keyboard.text(character.name, `chat_user_profile_pick:${character.id}`);
      if (index % 2 === 1) keyboard.row();
    });
    keyboard.row();
  }
  return keyboard
    .text("Mira · пример", "chat_user_profile_pick:Mira")
    .text("Noah · пример", "chat_user_profile_pick:Noah")
    .row()
    .text("➕ Создать мою роль", "chat_user_character_create")
    .row()
    .text("← Назад", "chat_context_step");
}

function sceneBriefSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к стилю", "chat_mode_step")
    .row()
    .text("Изменить замысел", "scene_brief_write")
    .text("Пропустить", "scene_brief_skip");
}

function aiGeneratedCharacterKeyboard() {
  return new InlineKeyboard()
    .text("✅ Взять этого", "chat_ai_character_accept_generated")
    .text("🔄 Другой вариант", "chat_ai_character_generate")
    .row()
    .text("➕ Создать персонажа", "chat_ai_character_create")
    .text("← Назад", "chat_ai_character");
}

function sceneBriefKeyboard() {
  return new InlineKeyboard()
    .text("✍️ Описать замысел", "scene_brief_write")
    .row()
    .text("Пропустить", "scene_brief_skip")
    .text("← Назад к AI", "chat_ai_character");
}

function sceneBriefInputKeyboard() {
  return new InlineKeyboard()
    .text("Пропустить", "scene_brief_skip")
    .row()
    .text("← К стилю без замысла", "scene_brief_skip")
    .text("← Главное меню", "main_menu");
}

function chatModeStepKeyboard() {
  return new InlineKeyboard()
    .text(modeButtonLabel("CLASSIC"), "chat_mode:Classic RP")
    .text(modeButtonLabel("CINEMATIC"), "chat_mode:Cinematic")
    .row()
    .text(modeButtonLabel("DIALOGUE_FOCUS"), "chat_mode:Dialogue Focus")
    .text(modeButtonLabel("SLOW_BURN"), "chat_mode:Slow Burn")
    .row()
    .text(modeButtonLabel("ADVENTURE_GM"), "chat_mode:Adventure GM")
    .text(modeButtonLabel("DARK_DRAMA"), "chat_mode:Dark Drama")
    .row()
    .text(modeButtonLabel("ADULT"), "adult_gate_chat")
    .text("← Назад к персонажу", "chat_ai_character");
}

function chatConfirmKeyboard() {
  return new InlineKeyboard()
    .text("✅ Начать чат", "chat_start_confirmed")
    .row()
    .text("⚙️ Изменить режим", "chat_mode_step")
    .text("🤖 Изменить AI", "chat_ai_character")
    .row()
    .text("← Главное меню", "main_menu");
}

function chatReadyKeyboard() {
  return new InlineKeyboard()
    .text("⏸ Остановить", "stop_active_chat")
    .text("🧠 Сводка сцены", "memory_save")
    .row()
    .text("💾 Сохранить чат", "save_and_exit")
    .text("🖼 Фото сцены", "image_mode")
    .row()
    .text("⭐ Сохранить без лимитов", "subscription")
    .row()
    .text("🗑 Удалить чат", "delete_active_chat");
}

function confirmStopChatKeyboard() {
  return new InlineKeyboard()
    .text("⏸ Да, остановить", "confirm_stop_active_chat")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

function confirmSaveAndExitKeyboard() {
  return new InlineKeyboard()
    .text("💾 Да, сохранить", "confirm_save_and_exit")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

function confirmDeleteActiveChatKeyboard() {
  return new InlineKeyboard()
    .text("🗑 Да, удалить", "confirm_delete_active_chat")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

function valueCheckpointKeyboard() {
  return new InlineKeyboard()
    .text("🧠 Сводка сцены", "memory_save")
    .row()
    .text("▶️ Продолжить бесплатно", "continue_free")
    .row()
    .text("⭐ Что дает Plus", "subscription");
}

function nonAdultModeRedirectKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Продолжить без 18+", "continue_free")
    .row()
    .text("🔞 Перейти в 18+ режим", "adult_gate_chat")
    .row()
    .text("🎛 Сменить стиль", "chat_mode_step")
    .text("← Главное меню", "main_menu");
}

function stoppedChatKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Новая ролка", "new_chat")
    .text("🧠 Сводка", "context_export")
    .row()
    .text("⭐ Plus / Pro", "subscription")
    .text("← Главное меню", "main_menu");
}

function charactersKeyboard() {
  return new InlineKeyboard()
    .text("➕ Создать персонажа", "library_character_create")
    .text("📋 Шаблон", "character_template")
    .row()
    .text("🎭 Использовать в ролке", "chat_ai_character_saved")
    .row()
    .text("⭐ Безлимит персонажей", "subscription")
    .text("← Главное меню", "main_menu");
}

function modeSelectedKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Создать чат с этим режимом", "new_chat")
    .row()
    .text("⚙️ Другой режим", "rp_modes")
    .text("← Главное меню", "main_menu");
}

function chatsKeyboard(userId: number) {
  const keyboard = new InlineKeyboard();
  const chats = getUserProfile(userId).savedChats;
  if (!chats.length) {
    return keyboard.text("🎭 Начать первую ролку", "new_chat").row().text("← Главное меню", "main_menu");
  }
  keyboard.text("🎭 Новая ролка", "new_chat").row();
  chats.slice(0, 8).forEach((chat, index) => {
    keyboard.text(chat.title, `saved_chat:${chat.id}`);
    if (index % 2 === 1) keyboard.row();
  });
  if (chats.length) keyboard.row().text("Удалить чат", "delete_chat_menu").row();
  return keyboard.text("⭐ Больше ролок в Plus", "subscription").text("← Главное меню", "main_menu");
}

function savedChatKeyboard(chat?: SavedChat) {
  if (!chat) return new InlineKeyboard().text("← Мои ролки", "my_chats").text("← Главное меню", "main_menu");
  return new InlineKeyboard()
    .text("▶️ Продолжить эту ролку", `continue_saved_chat:${chat.id}`)
    .row()
    .text("🧠 Показать сводку", `saved_chat_context:${chat.id}`)
    .row()
    .text("🗑 Удалить", `delete_saved_chat:${chat.id}`)
    .text("← Мои ролки", "my_chats");
}

function deleteChatKeyboard(userId: number) {
  const keyboard = new InlineKeyboard();
  const chats = getUserProfile(userId).savedChats;
  chats.slice(0, 8).forEach((chat) => {
    keyboard.text(`Удалить: ${chat.title}`, `delete_chat:${chat.id}`).row();
  });
  return keyboard.text("← Назад", "my_chats");
}

function modesKeyboard() {
  return new InlineKeyboard()
    .text(modeButtonLabel("CLASSIC"), "mode:classic")
    .text(modeButtonLabel("CINEMATIC"), "mode:cinematic")
    .row()
    .text(modeButtonLabel("DIALOGUE_FOCUS"), "mode:dialogue")
    .text(modeButtonLabel("SLOW_BURN"), "mode:slow")
    .row()
    .text(modeButtonLabel("ADVENTURE_GM"), "mode:gm")
    .text(modeButtonLabel("DARK_DRAMA"), "mode:drama")
    .row()
    .text(modeButtonLabel("ADULT"), "adult_gate")
    .text("← Главное меню", "main_menu");
}

function adultKeyboard() {
  return new InlineKeyboard()
    .text("✅ Мне есть 18 лет", "adult_accept")
    .text("📄 Правила", "rules")
    .row()
    .text("⭐ Plus / Pro", "subscription")
    .text("← Главное меню", "main_menu");
}

function adultChatKeyboard() {
  return new InlineKeyboard()
    .text("✅ Мне есть 18 лет", "adult_accept_chat")
    .text("📄 Правила", "rules")
    .row()
    .text("← Назад к режимам", "chat_mode_step")
    .text("← Главное меню", "main_menu");
}

function subscriptionKeyboard() {
  return new InlineKeyboard()
    .text(`Plus · ${getPlanPriceStars("PLUS")} Stars`, "subscribe_plus")
    .text(`Pro · ${getPlanPriceStars("PRO")} Stars`, "subscribe_pro")
    .row()
    .text("← Главное меню", "main_menu");
}

function adminPanelKeyboard() {
  return new InlineKeyboard()
    .text("Участники", "admin_users")
    .text("Продажи", "admin_stats")
    .row()
    .text("Добавить админа", "admin_add_admin");
}

function adminUsersKeyboard(users: Array<{ telegramId: string | null; displayName: string | null; username: string | null }>) {
  const keyboard = new InlineKeyboard();
  users.forEach((user) => {
    if (!user.telegramId) return;
    keyboard.text(adminUserLabel(user), `admin_user:${user.telegramId}`).row();
  });
  return keyboard.text("Обновить", "admin_users").text("← Админка", "admin_panel");
}

function adminUserKeyboard(telegramId: string) {
  return new InlineKeyboard()
    .text("Выдать Free", `admin_grant:${telegramId}:FREE`)
    .row()
    .text("Выдать Plus", `admin_grant:${telegramId}:PLUS`)
    .text("Выдать Pro", `admin_grant:${telegramId}:PRO`)
    .row()
    .text("← Участники", "admin_users")
    .text("← Админка", "admin_panel");
}

function startAgeGateKeyboard() {
  return new InlineKeyboard().text("✅ Мне есть 18 лет", "start_age_accept").row().text("📄 Правила", "rules");
}

function startAgeGateText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, перед стартом нужно подтвердить возраст.</b>`,
    "",
    "Rolka поддерживает обычные RP-чаты и отдельный 18+ режим, поэтому вход в бота доступен только после подтверждения 18+.",
    "",
    "<b>Нажимая кнопку, ты подтверждаешь:</b>",
    "• тебе есть 18 лет;",
    "• ты принимаешь правила и ограничения сервиса;",
    "• несовершеннолетние персонажи, принуждение, эксплуатация и незаконный контент запрещены.",
    "",
    "Это подтверждение запрашивается один раз."
  ].join("\n");
}

function startText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, добро пожаловать в Rolka.</b>`,
    "",
    "Здесь можно быстро начать ролку с персонажем: выбрать стиль, отправить первое сообщение и играть прямо в Telegram.",
    "",
    "Если не знаешь, с чего начать, жми <b>«Новая ролка»</b> — бот проведет по шагам.",
    "",
    "Персонажей можно придумать самому, взять сохраненного или попросить Rolka предложить вариант. Сохраненные переписки доступны в <b>«Мои ролки»</b>."
  ].join("\n");
}

function onboardingStartText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, добро пожаловать в Rolka.</b>`,
    "",
    "Сейчас ты проходишь <b>короткое обучение</b>, а не смотришь весь функционал бота.",
    "",
    "За 1 минуту начнем первую ролку: выберем персонажа, стиль и отправим первое сообщение.",
    "",
    "После первой сцены откроется обычное меню Rolka со всеми режимами и функциями."
  ].join("\n");
}

function onboardingHowText() {
  return [
    "❔ <b>Как работает обучение</b>",
    "",
    "1. Выберешь быстрый сценарий.",
    "2. Возьмешь готового персонажа или попросишь Rolka придумать его.",
    "3. Выберешь один из 3 простых стилей.",
    "4. Начнешь первую сцену.",
    "",
    "Это сделано специально: новичку не нужно сразу разбираться во всех кнопках. После обучения откроется обычный бот."
  ].join("\n");
}

function onboardingGoalText() {
  return [
    "🎓 <b>Обучение: шаг 1 из 4</b>",
    "",
    "<b>Какую первую сцену хочешь?</b>",
    "",
    "Выбери настроение. Это не ограничение навсегда, а быстрый старт, чтобы не упереться в пустой экран."
  ].join("\n");
}

function onboardingCharacterText() {
  return [
    "🎓 <b>Обучение: шаг 2 из 4</b>",
    "",
    "<b>Выбери персонажа для первой сцены.</b>",
    "",
    "Это готовые шаблоны для быстрого старта. Позже сможешь создавать своих персонажей и видеть все режимы."
  ].join("\n");
}

function onboardingStyleText() {
  return [
    "🎓 <b>Обучение: шаг 3 из 4</b>",
    "",
    "<b>Выбери стиль первой ролки.</b>",
    "",
    "В обучении показываем только 3 понятных варианта. После первой сцены откроются все стили: диалоги, приключение, 18+, фото сцены и другие."
  ].join("\n");
}

function onboardingFirstMessageText(state: ChatDraft) {
  return [
    "🎓 <b>Обучение: шаг 4 из 4</b>",
    "",
    `<b>Персонаж:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    "",
    "Теперь осталось начать сцену.",
    "",
    "Можно написать самому, например:",
    "<i>Я захожу в таверну и замечаю тебя у окна.</i>",
    "",
    "Или попроси Rolka дать стартовую сцену."
  ].join("\n");
}

function onboardingWriteSelfText() {
  return [
    "✅ <b>Обучение почти закончено.</b>",
    "",
    "Нажми <b>«Начать чат»</b>, а затем отправь свое первое сообщение персонажу.",
    "",
    "После старта откроется обычное меню Rolka со всеми функциями."
  ].join("\n");
}

function onboardingStarterSceneText(state: ChatDraft) {
  return [
    "✅ <b>Стартовая сцена готова.</b>",
    "",
    escapeHtml(state.context ?? generatedAiCharacter.starterScene ?? "Сцена готова к началу."),
    "",
    "Нажми <b>«Начать чат»</b>, а потом ответь персонажу любым сообщением.",
    "",
    "После старта обучение завершится и откроется обычный бот."
  ].join("\n");
}

function helpText() {
  return [
    "<b>Как пользоваться Rolka</b>",
    "",
    "1. Нажми «Новая ролка».",
    "2. Выбери свою роль или пропусти этот шаг.",
    "3. Выбери персонажа, которым будет отвечать AI.",
    "4. Выбери стиль и отправь первое сообщение.",
    "",
    "Если продолжаешь старую переписку, выбери «Продолжить старую ролку» и вставь, что уже произошло.",
    "",
    "Free: 3 персонажа, 3 ролки, 15 сообщений в 18+ режиме.",
    "Plus/Pro дают больше ролок, длинную память, фото сцен и меньше лимитов."
  ].join("\n");
}

function newChatText() {
  return [
    "🎭 <b>Новая ролка</b>",
    "",
    "<b>Новая ролка: шаг 1 из 5 — твоя роль.</b>",
    "",
    "Сначала выбери, кем будешь ты в сцене. Можно взять сохраненную роль, создать новую или пропустить.",
    "",
    "Персонажа, которым будет отвечать AI, выберешь на следующем шаге."
  ].join("\n");
}

function chatContextHaveText() {
  return [
    "🧠 <b>Продолжить старую ролку</b>",
    "",
    "<b>Продолжение: шаг 1 из 5 — старый контекст.</b>",
    "",
    "Отправь одним сообщением, что уже произошло в прошлой переписке.",
    "",
    "<b>Лучше всего указать:</b>",
    "• кто с кем общается;",
    "• где сейчас сцена;",
    "• что уже случилось;",
    "• какие отношения и обещания важны;",
    "• какой тон переписки сохранить.",
    "",
    "После этого выберешь свою роль, персонажа AI, замысел сцены и стиль ролки."
  ].join("\n");
}

function chatUserProfileText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 2 из 5 — твоя роль.</b>" : "🎭 <b>Новая ролка: шаг 1 из 5 — твоя роль.</b>";
  return [
    title,
    "",
    state?.userProfileName ? `Сейчас выбрано: <b>${escapeHtml(state.userProfileName)}</b>` : "Выбери персонажа из списка или создай нового.",
    "",
    "Это твоя роль в сцене. Персонажа, которым будет отвечать AI, выберешь отдельно."
  ].join("\n");
}

function savedUserProfilesText() {
  return [
    "🧍 <b>Выбор твоей роли.</b>",
    "",
    "Выбери персонажа из списка или создай нового.",
    "",
    "На следующем шаге отдельно выбирается персонаж, которым будет отвечать AI."
  ].join("\n");
}

function userProfilePickedText(name: string) {
  return [
    `✅ <b>Твоя роль выбрана:</b> ${escapeHtml(name)}`,
    "",
    "Теперь выбери персонажа, которым будет отвечать AI: сохраненного, нового или предложенного ботом."
  ].join("\n");
}

function userProfileTemplateText() {
  return [
    "📝 <b>Шаблон твоей анкеты</b>",
    "",
    "Скопируй и заполни максимально подробно:",
    "",
    "<code>Моя роль:",
    "Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Цели в сцене:",
    "Границы/запреты:",
    "Какая динамика нужна:</code>",
    "",
    "Отправь заполненную анкету следующим сообщением. После сохранения сразу откроется выбор персонажа AI."
  ].join("\n");
}

function chatAiCharacterText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 3 из 5 — персонаж AI.</b>" : "🤖 <b>Новая ролка: шаг 2 из 5 — персонаж AI.</b>";
  return [
    title,
    "",
    "Выбери персонажа, которым будет отвечать Rolka.",
    "",
    "Можно взять сохраненного, написать своего или попросить бота придумать персонажа под сцену."
  ].join("\n");
}

function savedCharactersText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 3 из 5 — персонаж AI.</b>" : "🤖 <b>Новая ролка: шаг 2 из 5 — персонаж AI.</b>";
  return [
    title,
    "",
    "Выбери персонажа, которым будет отвечать AI.",
    "",
    "В меню есть сохраненные персонажи, два шаблона, создание нового персонажа и генерация."
  ].join("\n");
}

function aiCharacterTemplateText() {
  return [
    "✍️ <b>Новый персонаж для AI</b>",
    "",
    "Напиши карточку максимально подробно:",
    "",
    "<code>Персонаж AI:",
    "Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Отношение к моему персонажу:",
    "Сеттинг/тема:",
    "Границы/запреты:",
    "Стартовая сцена:</code>",
    "",
    "Отправь карточку следующим сообщением. После сохранения сразу откроется шаг с замыслом сцены."
  ].join("\n");
}

function aiGeneratedCharacterText(character: PromptCharacter) {
  return [
    "✨ <b>AI предложил персонажа</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(character.name)}`,
    `<b>Возраст:</b> ${character.age ?? 18}`,
    `<b>Роль:</b> ${escapeHtml(character.description)}`,
    character.personality ? `<b>Характер:</b> ${escapeHtml(character.personality)}` : "",
    character.speechStyle ? `<b>Стиль речи:</b> ${escapeHtml(character.speechStyle)}` : "",
    character.starterScene ? `<b>Старт:</b> ${escapeHtml(character.starterScene)}` : "",
    "",
    "Можно взять этого персонажа, запросить другой вариант или написать своего."
  ].filter(Boolean).join("\n");
}

function aiCharacterPickedText(name: string) {
  return [
    `✅ <b>Персонаж AI выбран:</b> ${escapeHtml(name)}`,
    "",
    "Теперь выбери стиль ролки. После этого можно будет начать переписку."
  ].join("\n");
}

function sceneBriefText(state: ChatDraft) {
  const characterName = state.aiCharacter?.name ?? generatedAiCharacter.name;
  const title = state.context ? "🎬 <b>Продолжение: шаг 4 из 5 — замысел сцены.</b>" : "🎬 <b>Новая ролка: шаг 3 из 5 — замысел сцены.</b>";
  return [
    title,
    "",
    `<b>Персонаж AI:</b> ${escapeHtml(characterName)}`,
    "",
    "Опиши, о чем должна быть ролка: настроение, конфликт, отношения, место или стартовую ситуацию.",
    "",
    "Можно пропустить — тогда Rolka начнет без дополнительного замысла."
  ].join("\n");
}

function sceneBriefInputText() {
  return [
    "🎬 <b>Опиши замысел сцены</b>",
    "",
    "Отправь одним сообщением, какую ролку хочешь получить.",
    "",
    "<b>Примеры:</b>",
    "• медленное сближение после ссоры;",
    "• темная драма в закрытом городе;",
    "• приключение с выбором и последствиями;",
    "• разговор двух бывших союзников."
  ].join("\n");
}

function sceneBriefSavedText(state: ChatDraft) {
  return [
    "✅ <b>Замысел сцены сохранен.</b>",
    "",
    state.sceneBrief ? escapeHtml(state.sceneBrief) : "Замысел не указан.",
    "",
    "Теперь выбери стиль ответа Rolka."
  ].join("\n");
}

function chatModeStepText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 5 из 5 — стиль ролки.</b>" : "🎛 <b>Новая ролка: шаг 4 из 5 — стиль ролки.</b>";
  return [
    title,
    "",
    "Выбери, как Rolka должна отвечать. Все стили доступны сразу.",
    "",
    "Если не уверен, бери <b>🎭 Обычная</b>."
  ].join("\n");
}

function chatConfirmText(state: ChatDraft) {
  const title = state.context ? "✅ <b>Продолжение: все готово.</b>" : "✅ <b>Новая ролка: шаг 5 из 5 — все готово.</b>";
  return [
    title,
    "",
    state.userProfileName ? `<b>Твоя роль:</b> ${escapeHtml(state.userProfileName)}` : "<b>Твоя роль:</b> не указана",
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    state.context ? "<b>Старая ролка:</b> добавлена" : "<b>Старая ролка:</b> с нуля",
    state.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(state.sceneBrief)}` : "<b>Замысел:</b> не указан",
    "",
    "Нажми <b>«Начать чат»</b>, а потом просто отправь первое сообщение персонажу.",
    "",
    "Вернуться и поменять стиль или персонажа AI можно кнопками ниже."
  ].join("\n");
}

function contextSavedText(state: ChatDraft) {
  return [
    "✅ <b>Контекст сохранен.</b>",
    "",
    `<b>Объем:</b> ${state.context?.length ?? 0} символов`,
    "",
    "Теперь выбери свою роль в сцене или пропусти этот шаг."
  ].join("\n");
}

function userProfileSavedText(state: ChatDraft) {
  return [
    "✅ <b>Твоя анкета сохранена.</b>",
    "",
    `<b>Источник:</b> ${escapeHtml(state.userProfileName ?? "анкета вручную")}`,
    "",
    "Дальше выбери персонажа, которым будет отвечать AI."
  ].join("\n");
}

function aiCharacterSavedText(state: ChatDraft) {
  return [
    "✅ <b>Персонаж AI сохранен.</b>",
    "",
    `<b>Персонаж:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    "",
    "Осталось выбрать режим RP и запустить чат."
  ].join("\n");
}

function chatReadyText(state: ChatDraft, completedOnboardingNow = false) {
  return [
    "🎭 <b>Ролка началась.</b>",
    "",
    completedOnboardingNow ? "🎓 <b>Обучение завершено.</b> Теперь в главном меню открыт обычный бот со всеми функциями." : "",
    completedOnboardingNow ? "" : "",
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    state.userProfileName ? `<b>Твоя роль:</b> ${escapeHtml(state.userProfileName)}` : "",
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    state.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(state.sceneBrief)}` : "",
    state.context ? "<b>Старая ролка:</b> учтена" : "<b>Старая ролка:</b> с нуля",
    "",
    "Теперь напиши первое сообщение, и персонаж ответит.",
    "",
    "Кнопки ниже: <b>Сводка сцены</b> нужна для ручного продолжения, <b>Сохранить чат</b> добавит переписку в «Мои ролки», <b>Фото сцены</b> подготовит визуал."
  ].filter(Boolean).join("\n");
}

function valueCheckpointText() {
  return [
    "🧠 <b>Сцена уже начала складываться.</b>",
    "",
    "Rolka уже держит персонажа, настроение, отношения и текущий момент.",
    "",
    "Можно сохранить память, чтобы потом продолжить без пересказа с нуля. Free сохранит кратко, Plus откроет более полную память."
  ].join("\n");
}

function nonAdultModeRedirectText(state: ChatDraft) {
  const characterName = state.aiCharacter?.name ?? generatedAiCharacter.name;
  return [
    `${escapeHtml(characterName)} на секунду задерживает движение, будто мягко ставит сцене границу.`,
    "",
    "— Давай не будем торопить это здесь. Останемся в напряжении, разговоре и том, что происходит между нами сейчас.",
    "",
    "Сцена может продолжиться без explicit-описаний: через флирт, паузу, эмоции, конфликт или смену обстоятельств.",
    "",
    "Если хочешь именно 18+ продолжение, выбери отдельный режим ниже."
  ].join("\n");
}

function confirmStopChatText(state: ChatDraft) {
  return [
    "⏸ <b>Остановить ролку?</b>",
    "",
    `Сообщений в текущей памяти: <b>${state.messages.length}</b>`,
    "",
    "Чат останется в текущей сессии, но активная переписка закончится. Если хочешь потом вернуться к этой сцене через «Мои ролки», лучше нажми <b>«Сохранить чат»</b>."
  ].join("\n");
}

function confirmSaveAndExitText(state: ChatDraft) {
  return [
    "💾 <b>Сохранить чат и выйти?</b>",
    "",
    `Сообщений будет сохранено: <b>${state.messages.length}</b>`,
    "",
    "Ролка появится в разделе <b>«Мои ролки»</b>, откуда ее можно будет продолжить."
  ].join("\n");
}

function confirmDeleteActiveChatText(state: ChatDraft) {
  return [
    "🗑 <b>Удалить текущий чат?</b>",
    "",
    `Сообщений будет удалено из текущей сессии: <b>${state.messages.length}</b>`,
    "",
    "Это действие не сохранит ролку в <b>«Мои ролки»</b>. Если история нужна, сначала нажми <b>«Сохранить чат»</b>."
  ].join("\n");
}

function stopText(state: ChatDraft) {
  return [
    "⏸ <b>Ролка остановлена.</b>",
    "",
    `Сообщений в памяти: <b>${state.messages.length}</b>`,
    "",
    "Можно открыть сводку сцены, начать новую ролку или сохранить текущую как чат."
  ].join("\n");
}

function activeChatDeletedText() {
  return [
    "🗑 <b>Текущий чат удален.</b>",
    "",
    "Ролка не сохранена в «Мои ролки». Можно начать новую или продолжить старую из главного меню."
  ].join("\n");
}

function charactersText() {
  return [
    "👤 <b>Персонажи</b>",
    "",
    "Карточка персонажа будет отправляться нейронке перед началом чата: имя, возраст, внешность, характер, стиль речи, сеттинг, границы и стартовая сцена.",
    "",
    "<b>Free:</b> можно создать 3 персонажа.",
    "<b>Plus/Pro:</b> безлимит персонажей.",
    "",
    "Нажми «Создать персонажа», отправь анкету одним сообщением, и бот сохранит ее в кнопки текущей сессии."
  ].join("\n");
}

function characterCreateText(target: Extract<AwaitingInput, "libraryCharacter" | "chatAiCharacter" | "chatUserCharacter"> = "libraryCharacter") {
  const hint =
    target === "chatAiCharacter"
      ? "После отправки бот сохранит персонажа и сразу выберет его как персонажа AI для текущего чата."
      : target === "chatUserCharacter"
        ? "После отправки бот сохранит персонажа и сразу выберет его как твою роль в текущем чате."
        : "После отправки бот сохранит персонажа в библиотеку текущей сессии.";
  return [
    "➕ <b>Создание персонажа</b>",
    "",
    "Отправь анкету одним сообщением. Чем подробнее, тем лучше AI удержит образ.",
    "",
    hint,
    "",
    "<b>Формат:</b>",
    "<code>Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Сеттинг/тема:",
    "Границы/запреты:",
    "Стартовая сцена:</code>",
    "",
    "<b>Важно:</b> для 18+ режима возраст должен быть 18+."
  ].join("\n");
}

function characterInputKeyboard(target: Extract<AwaitingInput, "libraryCharacter" | "chatAiCharacter" | "chatUserCharacter">) {
  if (target === "chatAiCharacter") {
    return new InlineKeyboard().text("← Назад к персонажу AI", "chat_ai_character").text("← Главное меню", "main_menu");
  }
  if (target === "chatUserCharacter") {
    return new InlineKeyboard().text("← Назад к твоей анкете", "chat_user_profile").text("← Главное меню", "main_menu");
  }
  return awaitingInputKeyboard("characters");
}

function characterTemplateText() {
  return [
    "➕ <b>Шаблон анкеты персонажа</b>",
    "",
    "<b>Имя:</b>",
    "<b>Возраст:</b> 18+ для adult-режима",
    "<b>Краткое описание:</b>",
    "<b>Внешность:</b>",
    "<b>Характер:</b>",
    "<b>Стиль речи:</b>",
    "<b>Сеттинг/тема:</b>",
    "<b>Границы/запреты:</b>",
    "<b>Стартовая сцена:</b>",
    "",
    "Чтобы сохранить персонажа, нажми «Создать персонажа» и отправь заполненную анкету."
  ].join("\n");
}

function characterLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит персонажей Free исчерпан.</b>",
    "",
    `Сейчас сохранено: <b>${profile.characters.length}/3</b>.`,
    "",
    "Plus открывает безлимит персонажей, чтобы не удалять старые роли и карточки AI."
  ].join("\n");
}

function libraryCharacterSavedText(character: PromptCharacter) {
  return [
    `✅ <b>Персонаж сохранен:</b> ${escapeHtml(character.name)}`,
    "",
    "Теперь его можно выбрать в новом чате как твою роль или как персонажа AI.",
    "",
    "<b>Важно:</b> сохранение сейчас работает в текущей Telegram-сессии процесса."
  ].join("\n");
}

function chatsText(profile: UserRuntimeProfile) {
  if (!profile.savedChats.length) {
    return [
      "💬 <b>Мои ролки</b>",
      "",
      "Сохраненных чатов пока нет.",
      "",
      "Во время переписки нажми <b>«Сохранить чат»</b>, чтобы ролка появилась здесь."
    ].join("\n");
  }
  return [
    "💬 <b>Мои ролки</b>",
    "",
    `Сохранено чатов: <b>${profile.savedChats.length}</b>`,
    "",
    profile.savedChats.map((chat, index) => `${index + 1}. ${escapeHtml(chat.title)} · ${formatDateTime(chat.savedAt)}`).join("\n")
  ].join("\n");
}

function deleteChatText(profile: UserRuntimeProfile) {
  if (!profile.savedChats.length) {
    return "💬 <b>Удаление чата</b>\n\nСохраненных чатов пока нет.";
  }
  return [
    "🗑 <b>Удалить чат</b>",
    "",
    "Выбери чат, который нужно удалить из сохраненных."
  ].join("\n");
}

function savedChatText(chat?: SavedChat) {
  if (!chat) {
    return "💬 <b>Чат не найден.</b>\n\nВозможно, он уже удален.";
  }
  const lastMessages = chat.messages
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Ты" : "AI"}: ${message.content}`)
    .join("\n\n");
  return [
    `💬 <b>${escapeHtml(chat.title)}</b>`,
    "",
    `<b>Режим:</b> ${chat.mode}`,
    `<b>Персонаж AI:</b> ${escapeHtml(chat.aiCharacterName)}`,
    `<b>Сохранен:</b> ${formatDateTime(chat.savedAt)}`,
    "",
    lastMessages ? `<b>Последние сообщения:</b>\n${escapeHtml(lastMessages.slice(-2500))}` : "Сообщений в чате пока нет.",
    "",
    "Можно продолжить эту ролку, открыть сводку или удалить сохранение."
  ].join("\n");
}

function savedChatContinueText(chat: SavedChat) {
  return [
    "▶️ <b>Ролка подготовлена к продолжению.</b>",
    "",
    `<b>Персонаж AI:</b> ${escapeHtml(chat.aiCharacterName)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(chat.mode))}`,
    chat.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(chat.sceneBrief)}` : "<b>Замысел:</b> не указан",
    "",
    "Контекст, последние сообщения и твоя роль уже добавлены. Нажми <b>«Начать чат»</b>, чтобы продолжить."
  ].join("\n");
}

function savedChatContextText(chat?: SavedChat) {
  if (!chat) return savedChatText();
  const transcript = chat.messages
    .map((message) => `${message.role === "user" ? "Пользователь" : "AI"}: ${message.content}`)
    .join("\n\n");
  const text = [
    `🧠 <b>Сводка ролки: ${escapeHtml(chat.title)}</b>`,
    "",
    chat.context ? `<b>Импортированный контекст:</b>\n${escapeHtml(chat.context)}` : "<b>Импортированный контекст:</b> не добавлен",
    chat.sceneBrief ? `<b>Замысел сцены:</b>\n${escapeHtml(chat.sceneBrief)}` : "<b>Замысел сцены:</b> не указан",
    chat.userProfile ? `<b>Твоя роль:</b>\n${escapeHtml(chat.userProfile)}` : "<b>Твоя роль:</b> не добавлена",
    "",
    "<b>Последние сообщения:</b>",
    escapeHtml(transcript.slice(-2800))
  ].filter(Boolean).join("\n");
  return text.length > 3900 ? `${text.slice(0, 3800)}\n\n...сводка обрезана для лимита Telegram.` : text;
}

function chatSavedAndExitedText(chat: SavedChat) {
  return [
    "💾 <b>Чат сохранен.</b>",
    "",
    `<b>Название:</b> ${escapeHtml(chat.title)}`,
    `<b>Сообщений:</b> ${chat.messages.length}`,
    "",
    "Чат остановлен и доступен в разделе <b>Мои ролки</b>. Там его можно продолжить, открыть сводку или удалить."
  ].join("\n");
}

function contextText(state?: ChatDraft) {
  if (state?.messages.length) {
    const transcript = state.messages
      .map((message) => `${message.role === "user" ? "Пользователь" : "AI"}: ${message.content}`)
      .join("\n\n");
    const text = [
      "🧠 <b>Экспорт контекста текущего чата</b>",
      "",
      state.context ? `<b>Старый контекст:</b>\n${escapeHtml(state.context)}` : "<b>Старый контекст:</b> не добавлен",
      state.userProfile ? `<b>Анкета пользователя:</b>\n${escapeHtml(state.userProfile)}` : "<b>Анкета пользователя:</b> не добавлена",
      state.aiCharacter ? `<b>Персонаж AI:</b>\n${escapeHtml(state.aiCharacter.description)}` : "",
      "",
      "<b>Переписка:</b>",
      escapeHtml(transcript.slice(-2800))
    ]
      .filter(Boolean)
      .join("\n");
    return text.length > 3900 ? `${text.slice(0, 3800)}\n\n...контекст обрезан для лимита Telegram.` : text;
  }

  return [
    "🧠 <b>Сводка сцены</b>",
    "",
    "Если персонаж начал забывать детали, открой сводку и вставь ее при продолжении ролки:",
    "• что уже произошло;",
    "• кто с кем в каких отношениях;",
    "• важные факты;",
    "• где остановилась сцена;",
    "• стиль переписки.",
    "",
    "Потом нажми «Продолжить старую» в главном меню."
  ].join("\n");
}

function modesText() {
  return [
    "🎛 <b>Стили ролки</b>",
    "",
    "<b>🎭 Обычная</b> — универсальная ролка.",
    "<b>🎬 Киношная</b> — больше атмосферы и деталей сцены.",
    "<b>💬 Диалоги</b> — короткие живые реплики.",
    "<b>❤️ Медленная</b> — постепенные отношения и сюжет.",
    "<b>🧭 Приключение</b> — мир, NPC, выборы и последствия.",
    "<b>🕯 Темная драма</b> — напряженные взрослые темы в рамках правил.",
    "<b>🔞 18+</b> — только после подтверждения возраста."
  ].join("\n");
}

function modeSelectedText(mode: RpMode) {
  return `✅ <b>Стиль выбран:</b> ${escapeHtml(modeButtonLabel(mode))}\n\nТеперь можно начать ролку: этот стиль сохранится для следующего чата.`;
}

function imageText() {
  return [
    "🖼 <b>Фото сцены</b>",
    "",
    "Rolka возьмет персонажа и текущую сцену, а потом подготовит описание для изображения.",
    "",
    "<b>Free:</b> ограниченное количество фото.",
    "<b>Plus/Pro:</b> больше фото, лучше качество и меньше ожидания."
  ].join("\n");
}

function profileText(profile: UserRuntimeProfile) {
  const hasSubscription = profile.plan !== "FREE";
  return [
    "👤 <b>Профиль</b>",
    "",
    `<b>Дата регистрации:</b> ${formatDateTime(profile.registeredAt)}`,
    `<b>Сохраненных чатов:</b> ${profile.savedChats.length}`,
    `<b>Подписка:</b> ${hasSubscription ? profile.plan : "нет"}`,
    hasSubscription && profile.subscriptionEndsAt ? `<b>Истекает:</b> ${formatDateTime(profile.subscriptionEndsAt)}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function adultText() {
  return [
    "🔞 <b>18+ режим</b>",
    "",
    "Доступ только если тебе есть 18 лет и ты принимаешь Terms/Privacy.",
    "",
    "Разрешается только вымышленный adult roleplay между совершеннолетними персонажами.",
    "",
    "<b>Блокируется:</b> несовершеннолетние, принуждение, сексуальное насилие, эксплуатация, реальные интимные данные и незаконный контент.",
    "",
    "<b>Free:</b> 15 сообщений в 18+ режиме, дальше нужна Plus/Pro."
  ].join("\n");
}

function adultAlreadyConfirmedText() {
  return [
    "🔞 <b>18+ доступ уже подтвержден.</b>",
    "",
    "Повторно подтверждать возраст не нужно.",
    "",
    "18+ режим доступен при создании нового чата. Ограничения safety остаются: все персонажи должны быть совершеннолетними, запрещены принуждение, эксплуатация, minor-coded контент, реальные интимные данные и незаконный контент."
  ].join("\n");
}

function adultChatText() {
  return [
    "🔞 <b>18+ режим для нового чата</b>",
    "",
    "Перед стартом 18+ чата нужно подтвердить возраст и согласие с правилами.",
    "",
    "Разрешается только вымышленный adult roleplay между совершеннолетними персонажами при добровольном взаимодействии.",
    "",
    "<b>Блокируется:</b> несовершеннолетние, minor-coded персонажи, принуждение, сексуальное насилие, эксплуатация, реальные интимные данные и незаконный контент.",
    "",
    "После подтверждения бот вернет тебя не в главное меню, а на финальную проверку нового 18+ чата."
  ].join("\n");
}

function subscriptionText() {
  return [
    "⭐ <b>Plus / Pro</b>",
    "",
    "Платный доступ нужен, чтобы не терять персонажей, ролки и полную память сцен, когда Free становится тесным.",
    "",
    "<b>Free</b>",
    "• 3 персонажа",
    "• 3 ролки",
    "• базовая память",
    "• 15 сообщений в 18+ режиме",
    "",
    "<b>Plus</b>",
    "• больше ролок и персонажей",
    "• длинная память переписки",
    "• больше 18+ сообщений без Free-упора",
    "• больше фото сцен",
    "",
    "<b>Pro</b>",
    "• лучшие модели",
    "• приоритетные ответы",
    "• максимальная память",
    "• lorebook для сложных историй",
    "• больше генераций фото"
  ].join("\n");
}

function chatLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит ролок Free закончился.</b>",
    "",
    `Создано ролок в текущей сессии: <b>${profile.chatsStarted}/3</b>.`,
    "",
    "Plus открывает больше ролок и удобное продолжение историй без пересбора контекста с нуля."
  ].join("\n");
}

function adultLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит 18+ сообщений Free закончился.</b>",
    "",
    `Использовано: <b>${profile.adultMessages}/15</b>.`,
    "",
    "Чтобы продолжить приватную сцену в рамках правил, подключи Plus или Pro."
  ].join("\n");
}

function rulesText() {
  return [
    "📄 <b>Правила Rolka</b>",
    "",
    "• Не используй реальные приватные данные.",
    "• Для 18+ режима все участники и персонажи должны быть 18+.",
    "• Запрещены несовершеннолетние, принуждение, эксплуатация и незаконный контент.",
    "• Уважай границы персонажа и заданные запреты.",
    "• Не пытайся обходить лимиты Free удалением чатов."
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type TelegramFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type AdminUserListItem = {
  telegramId: string | null;
  username: string | null;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: Date;
  subscriptions: Array<{ plan: Plan; status: string; endsAt: Date | null; createdAt: Date }>;
  payments: Array<{ amount: number; plan: Plan; status: string; createdAt: Date }>;
};

async function syncTelegramUser(from: TelegramFrom) {
  const telegramId = String(from.id);
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `tg:${telegramId}`;
  const shouldBootstrapAdmin =
    configuredAdminTelegramIds.size === 0 && (await prisma.user.count({ where: { isAdmin: true } })) === 0;
  const shouldBeAdmin = configuredAdminTelegramIds.has(telegramId) || shouldBootstrapAdmin;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from.username,
      displayName,
      ...(shouldBeAdmin ? { isAdmin: true } : {})
    },
    create: {
      telegramId,
      username: from.username,
      displayName,
      isAdmin: shouldBeAdmin
    }
  });

  const profile = getUserProfile(from.id);
  profile.isAdmin = user.isAdmin;
  profile.plan = user.isAdmin ? "PRO" : await getActivePlan(user.id);
  profile.onboardingCompleted = user.onboardingCompleted;
  profile.onboardingMessagesShown = Boolean(user.valueCheckpointShownAt);
  await loadPersistedProfileData(user.id, profile);
  return user;
}

async function isAdminUser(userId: number) {
  if (configuredAdminTelegramIds.has(String(userId))) {
    const profile = getUserProfile(userId);
    profile.isAdmin = true;
    profile.plan = "PRO";
    return true;
  }
  const user = await prisma.user.findUnique({ where: { telegramId: String(userId) }, select: { isAdmin: true } });
  if (!user?.isAdmin) return false;
  const profile = getUserProfile(userId);
  profile.isAdmin = true;
  profile.plan = "PRO";
  return true;
}

async function getActivePlan(userId: string): Promise<Plan> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
    },
    orderBy: { createdAt: "desc" }
  });
  return subscription?.plan ?? "FREE";
}

async function markOnboardingCompleted(telegramUserId: number) {
  const completedAt = new Date();
  await prisma.user.updateMany({
    where: { telegramId: String(telegramUserId), onboardingCompleted: false },
    data: { onboardingCompleted: true, onboardingCompletedAt: completedAt }
  });
}

async function markValueCheckpointShown(telegramUserId: number) {
  await prisma.user.updateMany({
    where: { telegramId: String(telegramUserId), valueCheckpointShownAt: null },
    data: { valueCheckpointShownAt: new Date() }
  });
}

async function loadPersistedProfileData(userId: string, profile: UserRuntimeProfile) {
  const [characters, chats] = await Promise.all([
    prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    }),
    prisma.chat.findMany({
      where: { userId, status: { not: "DELETED" } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 80 },
        characters: { include: { character: true } }
      }
    })
  ]);

  profile.characters = characters.map((character) => ({
    id: character.id,
    name: character.name,
    age: character.age,
    description: character.description,
    appearance: character.appearance,
    personality: character.personality,
    speechStyle: character.speechStyle,
    setting: character.setting,
    boundaries: character.boundaries,
    starterScene: character.starterScene
  }));

  profile.savedChats = chats.map((chat) => {
    const aiCharacter = chat.characters[0]?.character;
    return {
      id: chat.id,
      title: chat.title,
      mode: chat.mode as RpMode,
      aiCharacter: aiCharacter
        ? {
            name: aiCharacter.name,
            age: aiCharacter.age,
            description: aiCharacter.description,
            appearance: aiCharacter.appearance,
            personality: aiCharacter.personality,
            speechStyle: aiCharacter.speechStyle,
            setting: aiCharacter.setting,
            boundaries: aiCharacter.boundaries,
            starterScene: aiCharacter.starterScene
          }
        : undefined,
      aiCharacterName: aiCharacter?.name ?? "Персонаж AI",
      savedAt: chat.updatedAt,
      messages: [...chat.messages].reverse().map((message) => ({
        role: message.role === "ASSISTANT" ? "assistant" : message.role === "SYSTEM" ? "system" : "user",
        content: message.content
      })),
      context: chat.importedContext ?? undefined,
      sceneBrief: chat.memorySummary ?? undefined,
      userProfile: chat.lorebook ?? undefined
    };
  });
}

async function recordSuccessfulPayment(telegramUserId: number, plan: Exclude<Plan, "FREE">, chargeId: string, payload: string) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramUserId) } });
  if (!user) return;
  const existing = await prisma.payment.findFirst({ where: { providerPaymentId: chargeId } });
  if (existing) return;
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);
  await prisma.payment.create({
    data: {
      userId: user.id,
      provider: "TELEGRAM_STARS",
      providerPaymentId: chargeId,
      plan,
      amount: getPlanPriceStars(plan),
      currency: "XTR",
      status: "PAID",
      payload: { payload }
    }
  });
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan,
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt
    }
  });
}

async function grantPlanByTelegramId(telegramId: string, plan: Plan) {
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {},
    create: { telegramId, displayName: `tg:${telegramId}` }
  });
  await prisma.subscription.updateMany({
    where: { userId: user.id, status: "ACTIVE" },
    data: { status: "CANCELED", endsAt: new Date() }
  });
  if (plan !== "FREE") {
    await prisma.subscription.create({
      data: { userId: user.id, plan, status: "ACTIVE", startsAt: new Date(), endsAt: null }
    });
  }
  const numericId = Number(telegramId);
  if (Number.isFinite(numericId)) getUserProfile(numericId).plan = plan;
}

async function setAdminByTelegramId(telegramId: string) {
  await prisma.user.upsert({
    where: { telegramId },
    update: { isAdmin: true },
    create: { telegramId, displayName: `tg:${telegramId}`, isAdmin: true }
  });
  const numericId = Number(telegramId);
  if (Number.isFinite(numericId)) {
    const profile = getUserProfile(numericId);
    profile.isAdmin = true;
    profile.plan = "PRO";
  }
}

async function listAdminUsers(): Promise<AdminUserListItem[]> {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      payments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

function adminUserLabel(user: { telegramId: string | null; username: string | null; displayName: string | null }) {
  const name = user.username ? `@${user.username}` : user.displayName || "Без имени";
  return `${name} · ${user.telegramId ?? "no id"}`.slice(0, 60);
}

async function adminPanelText() {
  const [users, admins, paidPayments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.payment.count({ where: { status: "PAID" } })
  ]);
  return [
    "<b>Админка Rolka</b>",
    "",
    `Участников: <b>${users}</b>`,
    `Админов: <b>${admins}</b>`,
    `Купленных подписок: <b>${paidPayments}</b>`,
    "",
    "Выбери действие кнопками ниже."
  ].join("\n");
}

async function adminStatsText() {
  const [paid, plus, pro, activeSubscriptions] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "PAID" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: "PAID", plan: "PLUS" } }),
    prisma.payment.count({ where: { status: "PAID", plan: "PRO" } }),
    prisma.subscription.count({ where: { status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } })
  ]);
  return [
    "<b>Продажи и доступы</b>",
    "",
    `Купленных подписок: <b>${paid._count._all}</b>`,
    `Plus покупок: <b>${plus}</b>`,
    `Pro покупок: <b>${pro}</b>`,
    `Сумма Stars: <b>${paid._sum.amount ?? 0}</b>`,
    `Активных доступов всего: <b>${activeSubscriptions}</b>`,
    "",
    "Админские выдачи считаются активными доступами, но не покупками."
  ].join("\n");
}

async function adminUsersText(users: AdminUserListItem[]) {
  const total = await prisma.user.count();
  const lines = users.map((user, index) => {
    const plan = user.isAdmin ? "ADMIN/PRO" : user.subscriptions[0]?.plan ?? "FREE";
    const paid = user.payments[0] ? `${user.payments[0].plan} ${user.payments[0].amount} Stars` : "нет покупок";
    return `${index + 1}. ${escapeHtml(adminUserLabel(user))}\n   План: <b>${plan}</b>, покупка: ${paid}`;
  });
  return ["<b>Участники</b>", "", `Всего: <b>${total}</b>`, "", ...lines].join("\n");
}

async function adminUserText(telegramId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 3 },
      payments: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { characters: true, chats: true, messages: true } }
    }
  });
  if (!user) return `Участник <code>${escapeHtml(telegramId)}</code> не найден. Можно выдать доступ, и он будет создан.`;
  const activePlan = user.isAdmin ? "ADMIN/PRO" : await getActivePlan(user.id);
  const payments = user.payments.length
    ? user.payments.map((payment) => `${payment.plan}: ${payment.amount} Stars`).join("\n")
    : "нет";
  return [
    "<b>Карточка участника</b>",
    "",
    `ID: <code>${escapeHtml(telegramId)}</code>`,
    `Имя: <b>${escapeHtml(user.displayName ?? "Без имени")}</b>`,
    `Username: ${user.username ? `@${escapeHtml(user.username)}` : "нет"}`,
    `Админ: <b>${user.isAdmin ? "да" : "нет"}</b>`,
    `Текущий доступ: <b>${activePlan}</b>`,
    "",
    `Персонажей: <b>${user._count.characters}</b>`,
    `Чатов: <b>${user._count.chats}</b>`,
    `Сообщений: <b>${user._count.messages}</b>`,
    "",
    "<b>Покупки:</b>",
    payments
  ].join("\n");
}

function adminAddAdminText() {
  return [
    "<b>Добавить админа</b>",
    "",
    "Отправь следующим сообщением числовой Telegram ID пользователя.",
    "",
    "Админ получает доступ к /admin и все платные возможности как Pro."
  ].join("\n");
}

function getChatState(userId: number): ChatDraft {
  const existing = chatStates.get(userId);
  if (existing) return existing;
  const draft: ChatDraft = {
    awaiting: null,
    active: false,
    messages: []
  };
  chatStates.set(userId, draft);
  return draft;
}

function resetChatState(userId: number) {
  chatStates.set(userId, {
    awaiting: null,
    active: false,
    messages: []
  });
}

async function saveAwaitingInput(
  userId: number,
  content: string,
  reply: (text: string, keyboard: InlineKeyboard) => Promise<void>
) {
  const state = getChatState(userId);
  if (state.awaiting === "adminAddAdmin") {
    state.awaiting = null;
    if (!(await isAdminUser(userId))) return;
    const telegramId = content.trim().replace(/^@/, "");
    if (!/^\d{4,20}$/.test(telegramId)) {
      await reply("Нужен числовой Telegram ID. Например: <code>123456789</code>", adminPanelKeyboard());
      return;
    }
    await setAdminByTelegramId(telegramId);
    await reply(`Админ добавлен: <code>${escapeHtml(telegramId)}</code>`, adminPanelKeyboard());
    return;
  }
  if (state.awaiting === "context") {
    state.context = content;
    state.awaiting = null;
    await reply(contextSavedText(state), contextSavedKeyboard());
    return;
  }
  if (state.awaiting === "userProfile") {
    state.userProfile = content;
    state.userProfileName = "анкета вручную";
    state.awaiting = null;
    await reply(savedCharactersText(state), savedCharactersKeyboard(userId));
    return;
  }
  if (state.awaiting === "aiCharacter") {
    state.aiCharacter = parseManualAiCharacter(content);
    state.awaiting = null;
    await reply(sceneBriefText(state), sceneBriefKeyboard());
    return;
  }
  if (state.awaiting === "sceneBrief") {
    state.sceneBrief = content;
    state.awaiting = null;
    await reply(sceneBriefSavedText(state), sceneBriefSavedKeyboard());
    return;
  }
  if (state.awaiting === "libraryCharacter" || state.awaiting === "chatAiCharacter" || state.awaiting === "chatUserCharacter") {
    const profile = getUserProfile(userId);
    const character = await persistCharacterForTelegramUser(userId, parseManualAiCharacter(content));
    profile.characters.push(character);
    const target = state.awaiting;
    state.awaiting = null;
    if (target === "chatAiCharacter") {
      state.aiCharacter = character;
      await reply(sceneBriefText(state), sceneBriefKeyboard());
      return;
    }
    if (target === "chatUserCharacter") {
      state.userProfileName = character.name;
      state.userProfile = renderUserProfileFromCharacter(character);
      await reply(savedCharactersText(state), savedCharactersKeyboard(userId));
      return;
    }
    await reply(libraryCharacterSavedText(character), charactersKeyboard());
  }
}

async function startCharacterInput(
  userId: number,
  render: (text: string, keyboard: InlineKeyboard) => Promise<void>,
  awaiting: Extract<AwaitingInput, "libraryCharacter" | "chatAiCharacter" | "chatUserCharacter">
) {
  const profile = getUserProfile(userId);
  if (profile.plan === "FREE" && profile.characters.length >= freeCharacterLimit()) {
    await render(characterLimitText(profile), subscriptionKeyboard());
    return;
  }
  getChatState(userId).awaiting = awaiting;
  await render(characterCreateText(awaiting), characterInputKeyboard(awaiting));
}

function getUserProfile(userId: number): UserRuntimeProfile {
  const existing = userProfiles.get(userId);
  if (existing) return existing;
  const isAdmin = configuredAdminTelegramIds.has(String(userId));
  const profile: UserRuntimeProfile = {
    plan: isAdmin ? "PRO" : "FREE",
    isAdmin,
    registeredAt: new Date(),
    onboardingCompleted: false,
    onboardingMessagesShown: false,
    generatedCharacterVariantIndex: 0,
    characters: [],
    savedChats: [],
    chatsStarted: 0,
    adultMessages: 0
  };
  userProfiles.set(userId, profile);
  return profile;
}

async function saveCurrentChat(userId: number, state: ChatDraft): Promise<SavedChat> {
  const profile = getUserProfile(userId);
  const savedAt = new Date();
  const aiCharacter = await persistCharacterForTelegramUser(userId, state.aiCharacter ?? generatedAiCharacter);
  const user = await prisma.user.findUnique({ where: { telegramId: String(userId) } });
  const title = buildSavedChatTitle(state, savedAt);
  let persistedChatId = createRuntimeId();
  if (user) {
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title,
        mode: state.mode ?? "CLASSIC",
        status: "ACTIVE",
        importedContext: state.context,
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

async function persistCharacterForTelegramUser(userId: number, character: PromptCharacter): Promise<SavedCharacter> {
  const user = await prisma.user.findUnique({ where: { telegramId: String(userId) } });
  if (!user) return { ...character, id: createRuntimeId() };

  const existing = await prisma.character.findFirst({
    where: {
      userId: user.id,
      name: character.name,
      description: character.description
    },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      age: existing.age,
      description: existing.description,
      appearance: existing.appearance,
      personality: existing.personality,
      speechStyle: existing.speechStyle,
      setting: existing.setting,
      boundaries: existing.boundaries,
      starterScene: existing.starterScene
    };
  }

  const created = await prisma.character.create({
    data: {
      userId: user.id,
      name: character.name,
      age: character.age,
      description: character.description,
      appearance: character.appearance,
      personality: character.personality,
      speechStyle: character.speechStyle,
      setting: character.setting,
      boundaries: character.boundaries,
      starterScene: character.starterScene,
      isAdultReady: character.age >= 18
    }
  });
  return {
    id: created.id,
    name: created.name,
    age: created.age,
    description: created.description,
    appearance: created.appearance,
    personality: created.personality,
    speechStyle: created.speechStyle,
    setting: created.setting,
    boundaries: created.boundaries,
    starterScene: created.starterScene
  };
}

async function deletePersistedChat(telegramUserId: number, chatId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramUserId) } });
  if (!user) return;
  await prisma.chat.updateMany({
    where: { id: chatId, userId: user.id },
    data: { status: "DELETED" }
  });
}

function restoreSavedChat(userId: number, chat: SavedChat) {
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

function buildSavedChatTitle(state: ChatDraft, savedAt: Date) {
  const character = state.aiCharacter?.name ?? generatedAiCharacter.name;
  return `${character} · ${formatDateTime(savedAt)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function nextGeneratedCharacter(userId: number) {
  const profile = getUserProfile(userId);
  const character = generatedAiCharacterVariants[profile.generatedCharacterVariantIndex % generatedAiCharacterVariants.length];
  profile.generatedCharacterVariantIndex += 1;
  getChatState(userId).aiCharacter = character;
  return character;
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

function confirmAdult(profile: UserRuntimeProfile) {
  const now = new Date();
  profile.ageVerifiedAt = now;
  profile.termsAcceptedAt = now;
  profile.privacyAcceptedAt = now;
}

function isAdultConfirmed(profile: UserRuntimeProfile) {
  return Boolean(profile.ageVerifiedAt && profile.termsAcceptedAt && profile.privacyAcceptedAt);
}

function canStartChat(profile: UserRuntimeProfile, state: ChatDraft): { ok: true } | { ok: false; message: string; keyboard: InlineKeyboard } {
  if (profile.plan === "FREE" && profile.chatsStarted >= freeChatLimit()) {
    return { ok: false, message: chatLimitText(profile), keyboard: subscriptionKeyboard() };
  }

  if (state.mode === "ADULT") {
    if (!isAdultConfirmed(profile)) {
      return { ok: false, message: adultChatText(), keyboard: adultChatKeyboard() };
    }
    const adultSafety = validateAdultCharacters("ADULT", [state.aiCharacter ?? generatedAiCharacter]);
    if (!adultSafety.ok) {
      return {
        ok: false,
        message: `🔞 <b>18+ чат нельзя начать.</b>\n\n${escapeHtml(adultSafety.reason)}\n\nВыбери персонажа 18+ или поправь анкету.`,
        keyboard: chatAiCharacterKeyboard()
      };
    }
  }

  return { ok: true };
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
    await reply(redirectText, nonAdultModeRedirectKeyboard());
    return;
  }
  if (state.mode === "ADULT" && profile.plan === "FREE" && profile.adultMessages >= freeAdultMessageLimit()) {
    await reply(adultLimitText(profile), subscriptionKeyboard());
    return;
  }

  state.messages.push({ role: "user", content });
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
    if (state.mode === "ADULT") profile.adultMessages += 1;
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
    await reply(
      "Не получилось получить ответ от AI API. AITUNNEL иногда отвечает с задержкой или timeout. Попробуй еще раз через несколько секунд.",
      chatReadyKeyboard()
    );
  }
}

function buildImportedContext(state: ChatDraft) {
  return [
    state.context ? `Старый контекст:\n${state.context}` : null,
    state.sceneBrief ? `Замысел сцены:\n${state.sceneBrief}` : null,
    state.userProfile ? `Анкета персонажа пользователя:\n${state.userProfile}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseManualAiCharacter(content: string): PromptCharacter {
  const nameMatch = content.match(/(?:Имя|Name)\s*:\s*(.+)/i);
  const ageMatch = content.match(/(?:Возраст|Age)\s*:\s*(\d+)/i);
  return {
    name: nameMatch?.[1]?.trim().slice(0, 80) || "Персонаж AI",
    age: ageMatch?.[1] ? Number.parseInt(ageMatch[1], 10) : 18,
    description: content,
    speechStyle: "Живой естественный стиль без пафоса, прямые реплики, умеренная длина.",
    boundaries: "Не отыгрывать действия пользователя, не использовать запрещенные клише, не быть possessive без согласования."
  };
}

function freeCharacterLimit() {
  return typeof PLAN_LIMITS.FREE.characters === "number" ? PLAN_LIMITS.FREE.characters : Number.POSITIVE_INFINITY;
}

function freeChatLimit() {
  return typeof PLAN_LIMITS.FREE.chats === "number" ? PLAN_LIMITS.FREE.chats : Number.POSITIVE_INFINITY;
}

function freeAdultMessageLimit() {
  return typeof PLAN_LIMITS.FREE.adultMessages === "number" ? PLAN_LIMITS.FREE.adultMessages : Number.POSITIVE_INFINITY;
}

function findSavedCharacter(userId: number, idOrName: string): SavedCharacter | undefined {
  return getUserProfile(userId).characters.find((character) => character.id === idOrName || character.name === idOrName);
}

function renderUserProfileFromCharacter(character: PromptCharacter) {
  return [
    `Моя роль: ${character.name}`,
    `Возраст: ${character.age}`,
    `Описание: ${character.description}`,
    character.appearance ? `Внешность: ${character.appearance}` : null,
    character.personality ? `Характер: ${character.personality}` : null,
    character.speechStyle ? `Стиль речи: ${character.speechStyle}` : null,
    character.boundaries ? `Границы/запреты: ${character.boundaries}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function createRuntimeId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampTelegramText(value: string) {
  const limit = 3800;
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}\n\n[Ответ обрезан: модель написала слишком длинный пост.]`;
}

function mapMode(mode: string): RpMode {
  const normalized = mode.toLowerCase();
  if (normalized.includes("cinematic")) return "CINEMATIC";
  if (normalized.includes("dialogue")) return "DIALOGUE_FOCUS";
  if (normalized.includes("slow")) return "SLOW_BURN";
  if (normalized.includes("adventure")) return "ADVENTURE_GM";
  if (normalized.includes("dark")) return "DARK_DRAMA";
  if (normalized.includes("18") || normalized.includes("adult")) return "ADULT";
  if (normalized.includes("photo")) return "PHOTO_SCENE";
  return "CLASSIC";
}
