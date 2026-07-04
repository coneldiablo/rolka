import { Bot, InlineKeyboard } from "grammy";
import { getPlanPriceStars, PLAN_LIMITS, type Plan } from "@/domain/plans";
import { buildPrompt, type PromptCharacter, type PromptMessage } from "@/domain/prompts";
import { createConfiguredTextProviders, generateWithFallback } from "@/domain/providers";
import { validateAdultCharacters, validateSafetyText } from "@/domain/safety";
import type { RpMode } from "@/domain/modes";
import { prisma } from "@/lib/prisma";

const token = process.env.TELEGRAM_BOT_TOKEN;

const appUrl = process.env.TELEGRAM_MINI_APP_URL ?? process.env.APP_URL;
const configuredAdminTelegramIds = new Set(
  (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

type AwaitingInput =
  | "context"
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
  aiCharacterName: string;
  savedAt: Date;
  messages: PromptMessage[];
  context?: string;
  userProfile?: string;
};

type UserRuntimeProfile = {
  plan: Plan;
  isAdmin: boolean;
  registeredAt: Date;
  subscriptionEndsAt?: Date;
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
  Mira: "Мой персонаж: Мира, 24 года. Сдержанная, внимательная, говорит коротко, не любит давление, держит дистанцию, но быстро считывает настроение собеседника.",
  Noah: "Мой персонаж: Ной, 31 год. Спокойный, ироничный, прямой в разговоре, не любит игры в молчанку, привык сначала наблюдать, потом действовать."
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
    if (!ctx.from?.id) return;
    const profile = getUserProfile(ctx.from.id);
    resetChatState(ctx.from.id);
    if (!isAdultConfirmed(profile)) {
      await ctx.reply(startAgeGateText(ctx.from.first_name), {
        parse_mode: "HTML",
        reply_markup: startAgeGateKeyboard()
      });
      return;
    }
    await ctx.reply(startText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.callbackQuery("start_age_accept", async (ctx) => {
    await ctx.answerCallbackQuery("Возраст подтвержден");
    if (ctx.from?.id) {
      confirmAdult(getUserProfile(ctx.from.id));
      await syncTelegramUser(ctx.from);
      resetChatState(ctx.from.id);
    }
    await ctx.editMessageText(startText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.command("menu", async (ctx) => {
    if (ctx.from?.id) await syncTelegramUser(ctx.from);
    await ctx.reply("Главное меню Rolka:", {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
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
    await ctx.reply(helpText(), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
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
    await ctx.editMessageText(startText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.callbackQuery("new_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const previousMode = getChatState(ctx.from.id).mode;
    resetChatState(ctx.from.id);
    if (previousMode) getChatState(ctx.from.id).mode = previousMode;
    await ctx.editMessageText(newChatText(), {
      parse_mode: "HTML",
      reply_markup: chatContextKeyboard()
    });
  });

  bot.callbackQuery("chat_context_step", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(newChatText(), {
      parse_mode: "HTML",
      reply_markup: chatContextKeyboard()
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
    await ctx.editMessageText(savedUserProfilesText(), {
      parse_mode: "HTML",
      reply_markup: savedUserProfilesKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_user_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(savedUserProfilesText(), {
      parse_mode: "HTML",
      reply_markup: savedUserProfilesKeyboard(ctx.from.id)
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
    state.userProfile = character ? renderUserProfileFromCharacter(character) : sampleUserProfiles[name] ?? `Мой персонаж: ${name}`;
    state.awaiting = null;
    await ctx.editMessageText(userProfilePickedText(state.userProfileName), {
      parse_mode: "HTML",
      reply_markup: userProfileSavedKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatAiCharacterText(), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatAiCharacterText(), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character_saved", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(savedCharactersText(), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("chat_ai_character_custom", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "aiCharacter";
    await ctx.editMessageText(aiCharacterTemplateText(), {
      parse_mode: "HTML",
      reply_markup: aiCharacterInputKeyboard()
    });
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
    await ctx.editMessageText(aiGeneratedCharacterText(), {
      parse_mode: "HTML",
      reply_markup: aiGeneratedCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character_accept_generated", async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж выбран");
    const state = getChatState(ctx.from.id);
    state.aiCharacter = generatedAiCharacter;
    state.awaiting = null;
    await ctx.editMessageText(aiCharacterPickedText(state.aiCharacter.name), {
      parse_mode: "HTML",
      reply_markup: aiCharacterSavedKeyboard()
    });
  });

  bot.callbackQuery(/^chat_ai_character_pick:/, async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж AI выбран");
    const name = ctx.callbackQuery.data.replace("chat_ai_character_pick:", "");
    const state = getChatState(ctx.from.id);
    state.aiCharacter = findSavedCharacter(ctx.from.id, name) ?? sampleAiCharacters[name] ?? generatedAiCharacter;
    state.awaiting = null;
    await ctx.editMessageText(aiCharacterPickedText(state.aiCharacter.name), {
      parse_mode: "HTML",
      reply_markup: aiCharacterSavedKeyboard()
    });
  });

  bot.callbackQuery("chat_mode_step", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatModeStepText(), {
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
    await ctx.editMessageText(chatConfirmText(state, mode), {
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
    profile.chatsStarted += 1;
    state.active = true;
    state.awaiting = null;
    state.mode ??= "CLASSIC";
    state.aiCharacter ??= generatedAiCharacter;
    await ctx.editMessageText(chatReadyText(state), {
      parse_mode: "HTML",
      reply_markup: chatReadyKeyboard()
    });
  });

  bot.callbackQuery("characters", async (ctx) => {
    await ctx.answerCallbackQuery();
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
    getChatState(ctx.from.id).awaiting = null;
    await ctx.editMessageText(chatsText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery("delete_chat_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(deleteChatText(getUserProfile(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: deleteChatKeyboard(ctx.from.id)
    });
  });

  bot.callbackQuery(/^delete_chat:/, async (ctx) => {
    await ctx.answerCallbackQuery("Чат удален");
    const id = ctx.callbackQuery.data.replace("delete_chat:", "");
    const profile = getUserProfile(ctx.from.id);
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
    await ctx.answerCallbackQuery("Чат сохранен");
    const state = getChatState(ctx.from.id);
    const saved = saveCurrentChat(ctx.from.id, state);
    state.active = false;
    state.awaiting = null;
    state.messages = [];
    await ctx.editMessageText(chatSavedAndExitedText(saved), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard(ctx.from.id)
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
      await ctx.editMessageText(chatConfirmText(state, "18+ Adult"), {
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
    await ctx.editMessageText(chatConfirmText(state, "18+ Adult"), {
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

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Новый чат", "new_chat")
    .text("👤 Персонажи", "characters")
    .row()
    .text("💬 Мои чаты", "my_chats")
    .text("⚙️ RP-режимы", "rp_modes")
    .row()
    .text("⭐ Подписка", "subscription")
    .text("🔞 18+ доступ", "adult_gate")
    .row()
    .text("📄 Правила", "rules")
    .text("👤 Профиль", "profile");
}

function backKeyboard() {
  return new InlineKeyboard().text("← Главное меню", "main_menu");
}

function awaitingInputKeyboard(backCallback: string) {
  return new InlineKeyboard().text("← Назад", backCallback).text("← Главное меню", "main_menu");
}

function chatContextKeyboard() {
  return new InlineKeyboard()
    .text("🧠 У меня есть старый контекст", "chat_context_have")
    .row()
    .text("Пропустить", "chat_context_skip")
    .text("← Главное меню", "main_menu");
}

function chatContextAwaitingKeyboard() {
  return new InlineKeyboard()
    .text("Пропустить контекст", "chat_context_skip")
    .row()
    .text("← Главное меню", "main_menu");
}

function contextSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к выбору персонажа", "chat_user_profile")
    .row()
    .text("Изменить контекст", "chat_context_have")
    .text("← Главное меню", "main_menu");
}

function chatUserProfileKeyboard() {
  return new InlineKeyboard()
    .text("📝 Дать анкету о себе", "chat_user_profile_template")
    .text("👤 Мои персонажи", "chat_user_profile_saved")
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
    .text("Изменить персонажа", "chat_user_profile")
    .text("← Назад к выбору", "chat_user_profile");
}

function chatAiCharacterKeyboard() {
  return new InlineKeyboard()
    .text("👤 Мои персонажи", "chat_ai_character_saved")
    .text("✍️ Написать с нуля", "chat_ai_character_custom")
    .row()
    .text("✨ Пусть AI предложит", "chat_ai_character_generate")
    .row()
    .text("← Назад к персонажу", "chat_user_profile");
}

function aiCharacterInputKeyboard() {
  return new InlineKeyboard()
    .text("← Назад к персонажу AI", "chat_ai_character")
    .text("← Главное меню", "main_menu");
}

function aiCharacterSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к режиму", "chat_mode_step")
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
    .text("➕ Создать для этого чата", "chat_ai_character_create")
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
    .text("➕ Создать персонажа", "chat_user_character_create")
    .row()
    .text("← Назад", "chat_context_step");
}

function aiGeneratedCharacterKeyboard() {
  return new InlineKeyboard()
    .text("✅ Взять этого", "chat_ai_character_accept_generated")
    .text("🔄 Другой вариант", "chat_ai_character_generate")
    .row()
    .text("✍️ Написать самому", "chat_ai_character_custom")
    .text("← Назад", "chat_ai_character");
}

function chatModeStepKeyboard() {
  return new InlineKeyboard()
    .text("Classic", "chat_mode:Classic RP")
    .text("Cinematic", "chat_mode:Cinematic")
    .row()
    .text("Dialogue", "chat_mode:Dialogue Focus")
    .text("Slow Burn", "chat_mode:Slow Burn")
    .row()
    .text("Adventure GM", "chat_mode:Adventure GM")
    .text("18+ Adult", "adult_gate_chat")
    .row()
    .text("← Назад к персонажу", "chat_ai_character");
}

function chatConfirmKeyboard() {
  return new InlineKeyboard()
    .text("✅ Начать чат", "chat_start_confirmed")
    .row()
    .text("⚙️ Изменить режим", "chat_mode_step")
    .text("👤 Изменить персонажа", "chat_ai_character")
    .row()
    .text("← Главное меню", "main_menu");
}

function chatReadyKeyboard() {
  return new InlineKeyboard()
    .text("🧠 Экспорт контекста", "context_export")
    .text("🖼 Фото сцены", "image_mode")
    .row()
    .text("💾 Сохранить и выйти", "save_and_exit")
    .text("⭐ Снять лимиты", "subscription")
    .row()
    .text("← Главное меню", "main_menu");
}

function charactersKeyboard() {
  return new InlineKeyboard()
    .text("➕ Создать персонажа", "library_character_create")
    .text("📋 Шаблон", "character_template")
    .row()
    .text("🎭 Использовать в чате", "chat_ai_character_saved")
    .row()
    .text("⭐ Снять лимит", "subscription")
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
  chats.slice(0, 8).forEach((chat, index) => {
    keyboard.text(chat.title, `saved_chat:${chat.id}`);
    if (index % 2 === 1) keyboard.row();
  });
  if (chats.length) keyboard.row().text("Удалить чат", "delete_chat_menu").row();
  return keyboard.text("← Главное меню", "main_menu");
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
    .text("Classic RP", "mode:classic")
    .text("Cinematic", "mode:cinematic")
    .row()
    .text("Dialogue Focus", "mode:dialogue")
    .text("Slow Burn", "mode:slow")
    .row()
    .text("Adventure GM", "mode:gm")
    .text("Dark Drama", "mode:drama")
    .row()
    .text("18+ Adult", "adult_gate")
    .text("Photo Scene", "image_mode")
    .row()
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

function cabinetKeyboard() {
  const keyboard = new InlineKeyboard();
  if (appUrl && isHttpsUrl(appUrl)) {
    keyboard.webApp("Открыть WebApp кабинет", appUrl).row();
  }
  return keyboard.text("← Главное меню", "main_menu");
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
    "Это RP-бот для переписок с персонажами.",
    "",
    "Здесь можно:",
    "• создавать и хранить своих персонажей;",
    "• запускать новые RP-чаты;",
    "• выбирать стиль roleplay;",
    "• переносить контекст старой переписки в новый чат;",
    "• сохранять переписки и возвращаться к ним;",
    "• использовать 18+ режим после подтверждения возраста;",
    "• открыть Plus/Pro для снятия лимитов.",
    "",
    "<b>Выбери действие ниже.</b>"
  ].join("\n");
}

function helpText() {
  return [
    "<b>Как пользоваться Rolka</b>",
    "",
    "1. Создай персонажа или возьми шаблон анкеты.",
    "2. Выбери RP-режим.",
    "3. Создай чат и начни сцену.",
    "4. Если AI начал забывать детали, нажми «Контекст» и перенеси snapshot в новый чат.",
    "",
    "Free: 3 персонажа, 3 чата, 15 сообщений в 18+ режиме.",
    "Plus/Pro снимают основные ограничения."
  ].join("\n");
}

function newChatText() {
  return [
    "🎭 <b>Новый RP-чат</b>",
    "",
    "<b>Шаг 1 из 5 — контекст.</b>",
    "",
    "Если ты переносишь старую переписку, сначала дай контекст: что уже произошло, кто с кем в каких отношениях, где сцена остановилась и какие факты AI не должен забыть.",
    "",
    "Если начинаешь с нуля, просто пропусти этот шаг.",
    "",
    "<i>Приоритет:</i> контекст → твой персонаж → персонаж AI → режим → старт."
  ].join("\n");
}

function chatContextHaveText() {
  return [
    "🧠 <b>Контекст старой переписки</b>",
    "",
    "Отправь его следующим сообщением максимально подробно.",
    "",
    "<b>Что лучше включить:</b>",
    "• краткое содержание сюжета;",
    "• текущую сцену и место;",
    "• отношения персонажей;",
    "• важные факты и обещания;",
    "• стиль переписки, который нужно сохранить.",
    "",
    "Отправь контекст одним сообщением. После сохранения появится кнопка продолжения."
  ].join("\n");
}

function chatUserProfileText(state?: ChatDraft) {
  return [
    "👤 <b>Шаг 2 из 5 — выбор персонажа.</b>",
    "",
    state?.userProfileName ? `Сейчас выбрано: <b>${escapeHtml(state.userProfileName)}</b>` : "Выбери персонажа из списка или создай нового.",
    "",
    "Этот персонаж будет твоей ролью в сцене."
  ].join("\n");
}

function savedUserProfilesText() {
  return [
    "👤 <b>Шаг 2 из 5 — выбор персонажа.</b>",
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
    "Теперь нужно выбрать, кем будет отвечать нейронка: использовать одного из сохраненных персонажей, написать нового или попросить AI предложить вариант."
  ].join("\n");
}

function userProfileTemplateText() {
  return [
    "📝 <b>Шаблон твоей анкеты</b>",
    "",
    "Скопируй и заполни максимально подробно:",
    "",
    "<code>Мой персонаж:",
    "Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Цели в сцене:",
    "Границы/запреты:",
    "Какая динамика нужна:</code>",
    "",
    "Отправь заполненную анкету следующим сообщением. После сохранения появится кнопка продолжения."
  ].join("\n");
}

function chatAiCharacterText() {
  return [
    "👤 <b>Шаг 3 из 5 — персонаж для AI.</b>",
    "",
    "Теперь выбери, кем будет отвечать нейронка.",
    "",
    "<b>Варианты:</b>",
    "• взять одного из твоих сохраненных персонажей;",
    "• написать нового персонажа с нуля;",
    "• попросить AI предложить персонажа под твою идею.",
    "",
    "Лучше всего работает подробная карточка: имя, возраст, внешность, характер, стиль речи, тема, границы и стартовая сцена."
  ].join("\n");
}

function savedCharactersText() {
  return [
    "👤 <b>Мои персонажи</b>",
    "",
    "Выбери персонажа, которым будет отвечать AI, или создай нового прямо для этого чата.",
    "",
    "<b>Free:</b> 3 персонажа.",
    "<b>Plus/Pro:</b> безлимит."
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
    "Отправь карточку следующим сообщением. После сохранения появится кнопка перехода к режиму."
  ].join("\n");
}

function aiGeneratedCharacterText() {
  return [
    "✨ <b>AI предложил персонажа</b>",
    "",
    "<b>Имя:</b> Элиан Вейр",
    "<b>Возраст:</b> 27",
    "<b>Роль:</b> харизматичный незнакомец с собственной тайной",
    "<b>Характер:</b> спокойный, внимательный, говорит мало, но точно; умеет давить паузой.",
    "<b>Стиль речи:</b> мягкая ирония, короткие фразы, без канцелярита.",
    "<b>Динамика:</b> медленное сближение, напряжение, секреты, выбор доверять или нет.",
    "",
    "Можно взять этого персонажа, запросить другой вариант или написать своего."
  ].join("\n");
}

function aiCharacterPickedText(name: string) {
  return [
    `✅ <b>Персонаж AI выбран:</b> ${escapeHtml(name)}`,
    "",
    "Теперь выбери режим RP. После этого можно будет начать реальную переписку."
  ].join("\n");
}

function chatModeStepText() {
  return [
    "⚙️ <b>Шаг 4 из 5 — режим RP.</b>",
    "",
    "Выбери стиль, в котором AI будет вести переписку.",
    "",
    "<b>Совет:</b>",
    "• для обычной игры — Classic;",
    "• для атмосферы — Cinematic;",
    "• для коротких ответов — Dialogue;",
    "• для отношений — Slow Burn;",
    "• для сюжета и NPC — Adventure GM."
  ].join("\n");
}

function chatConfirmText(state: ChatDraft, modeLabel?: string) {
  return [
    "✅ <b>Шаг 5 из 5 — проверка перед стартом.</b>",
    "",
    `<b>Контекст:</b> ${state.context ? "добавлен" : "нет"}`,
    `<b>Твоя анкета:</b> ${state.userProfileName ? escapeHtml(state.userProfileName) : state.userProfile ? "добавлена" : "нет"}`,
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    `<b>Режим:</b> ${escapeHtml(modeLabel ?? state.mode ?? "CLASSIC")}`,
    "",
    "После старта Rolka соберет системный prompt: safety → стиль → режим → персонажи → контекст → последние сообщения.",
    "",
    "Нажми «Начать чат», если все готово."
  ].join("\n");
}

function contextSavedText(state: ChatDraft) {
  return [
    "✅ <b>Контекст сохранен.</b>",
    "",
    `<b>Объем:</b> ${state.context?.length ?? 0} символов`,
    "",
    "Теперь можно добавить твою роль в сцене или пропустить этот шаг."
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

function chatReadyText(state: ChatDraft) {
  return [
    "🎭 <b>Чат готов.</b>",
    "",
    `<b>Режим:</b> ${state.mode ?? "CLASSIC"}`,
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    state.context ? "<b>Контекст:</b> добавлен" : "<b>Контекст:</b> нет",
    state.userProfile ? "<b>Твоя анкета:</b> добавлена" : "<b>Твоя анкета:</b> нет",
    "",
    "Теперь просто отправь сообщение в этот чат, и бот ответит через AI.",
    "",
    "Чтобы остановить RP-чат, напиши <code>/stop</code>."
  ].join("\n");
}

function stopText(state: ChatDraft) {
  return [
    "⏹ <b>RP-чат остановлен.</b>",
    "",
    `Сообщений в локальной памяти: <b>${state.messages.length}</b>`,
    "",
    "Можно экспортировать контекст, снять лимиты или начать новый чат."
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
    "В Free можно создать 3 персонажа. Plus/Pro открывает безлимит."
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
      "💬 <b>Мои чаты</b>",
      "",
      "Сохраненных чатов пока нет.",
      "",
      "Во время переписки нажми <b>«Сохранить и выйти»</b>, чтобы чат появился здесь."
    ].join("\n");
  }
  return [
    "💬 <b>Мои чаты</b>",
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
    lastMessages ? `<b>Последние сообщения:</b>\n${escapeHtml(lastMessages.slice(-2500))}` : "Сообщений в чате пока нет."
  ].join("\n");
}

function chatSavedAndExitedText(chat: SavedChat) {
  return [
    "💾 <b>Чат сохранен.</b>",
    "",
    `<b>Название:</b> ${escapeHtml(chat.title)}`,
    `<b>Сообщений:</b> ${chat.messages.length}`,
    "",
    "Чат завершен и доступен в разделе <b>Мои чаты</b>."
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
    "🧠 <b>Экспорт контекста</b>",
    "",
    "Если AI начал забывать детали, Rolka делает snapshot переписки:",
    "• полный текст диалога;",
    "• краткая выжимка;",
    "• факты персонажей;",
    "• отношения и текущая сцена;",
    "• готовый prompt для нового чата.",
    "",
    "Потом ты создаешь новый чат и отправляешь туда персонажа + контекст."
  ].join("\n");
}

function modesText() {
  return [
    "⚙️ <b>RP-режимы</b>",
    "",
    "<b>Classic RP</b> — обычная ролевая переписка.",
    "<b>Cinematic</b> — больше атмосферы, сцен и деталей.",
    "<b>Dialogue Focus</b> — короткие живые реплики.",
    "<b>Slow Burn</b> — медленное развитие отношений/сюжета.",
    "<b>Adventure GM</b> — AI ведет мир, NPC и последствия.",
    "<b>Dark Drama</b> — напряженные взрослые темы без запрещенного контента.",
    "<b>18+ Adult</b> — только после подтверждения 18+.",
    "<b>Photo Scene</b> — генерация картинки сцены."
  ].join("\n");
}

function modeSelectedText(mode: RpMode) {
  return `✅ <b>Режим выбран:</b> ${escapeHtml(mode)}\n\nТеперь можно создать чат: выбранный режим сохранится в черновик.`;
}

function imageText() {
  return [
    "🖼 <b>Фото / сцены</b>",
    "",
    "Эта функция находится на стадии разработки и скоро будет доступна."
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
    "⭐ <b>Подписка Rolka</b>",
    "",
    "<b>Free</b>",
    "• 3 персонажа",
    "• 3 чата",
    "• нельзя удалять чаты",
    "• 15 сообщений в 18+ режиме",
    "",
    "<b>Plus</b>",
    "• безлимит персонажей и чатов",
    "• удаление/архив чатов",
    "• больше 18+ сообщений",
    "• полный экспорт контекста",
    "",
    "<b>Pro</b>",
    "• премиум модели",
    "• priority queue",
    "• long memory",
    "• lorebook",
    "• больше генераций фото"
  ].join("\n");
}

function chatLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит чатов Free исчерпан.</b>",
    "",
    `Создано чатов в текущей сессии: <b>${profile.chatsStarted}/3</b>.`,
    "",
    "В Free доступно 3 чата, удаление не помогает обходить лимит. Для новых чатов нужен Plus или Pro."
  ].join("\n");
}

function adultLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит 18+ сообщений Free закончился.</b>",
    "",
    `Использовано: <b>${profile.adultMessages}/15</b>.`,
    "",
    "Чтобы продолжить 18+ RP без ограничения, подключи Plus или Pro."
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

function cabinetText() {
  if (appUrl && isHttpsUrl(appUrl)) {
    return "🗝 <b>WebApp кабинет</b>\n\nОткрой кабинет кнопкой ниже: там будет удобная красивая переписка, персонажи, чаты и экспорт контекста.";
  }
  return [
    "🗝 <b>WebApp кабинет</b>",
    "",
    "Сейчас сайт запущен локально на <code>http://localhost:3000</code>.",
    "Telegram Mini App открывает только публичные HTTPS-ссылки.",
    "",
    "Поэтому обычный Telegram-бот работает здесь, а красивую WebApp-переписку подключим через ngrok/Cloudflare Tunnel или деплой."
  ].join("\n");
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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
    await reply(userProfileSavedText(state), userProfileSavedKeyboard());
    return;
  }
  if (state.awaiting === "aiCharacter") {
    state.aiCharacter = parseManualAiCharacter(content);
    state.awaiting = null;
    await reply(aiCharacterSavedText(state), aiCharacterSavedKeyboard());
    return;
  }
  if (state.awaiting === "libraryCharacter" || state.awaiting === "chatAiCharacter" || state.awaiting === "chatUserCharacter") {
    const profile = getUserProfile(userId);
    const character = { ...parseManualAiCharacter(content), id: createRuntimeId() };
    profile.characters.push(character);
    const target = state.awaiting;
    state.awaiting = null;
    if (target === "chatAiCharacter") {
      state.aiCharacter = character;
      await reply(aiCharacterSavedText(state), aiCharacterSavedKeyboard());
      return;
    }
    if (target === "chatUserCharacter") {
      state.userProfileName = character.name;
      state.userProfile = renderUserProfileFromCharacter(character);
      await reply(userProfileSavedText(state), userProfileSavedKeyboard());
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
    characters: [],
    savedChats: [],
    chatsStarted: 0,
    adultMessages: 0
  };
  userProfiles.set(userId, profile);
  return profile;
}

function saveCurrentChat(userId: number, state: ChatDraft): SavedChat {
  const profile = getUserProfile(userId);
  const savedAt = new Date();
  const saved: SavedChat = {
    id: createRuntimeId(),
    title: buildSavedChatTitle(state, savedAt),
    mode: state.mode ?? "CLASSIC",
    aiCharacterName: state.aiCharacter?.name ?? generatedAiCharacter.name,
    savedAt,
    messages: [...state.messages],
    context: state.context,
    userProfile: state.userProfile
  };
  profile.savedChats.unshift(saved);
  return saved;
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
    `Мой персонаж: ${character.name}`,
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
