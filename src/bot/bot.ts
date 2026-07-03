import { Bot, InlineKeyboard } from "grammy";
import { getPlanPriceStars } from "@/domain/plans";
import { buildPrompt, type PromptCharacter, type PromptMessage } from "@/domain/prompts";
import { createConfiguredTextProviders, generateWithFallback } from "@/domain/providers";
import { validateSafetyText } from "@/domain/safety";
import type { RpMode } from "@/domain/modes";

const token = process.env.TELEGRAM_BOT_TOKEN;

const appUrl = process.env.TELEGRAM_MINI_APP_URL ?? process.env.APP_URL;

type AwaitingInput = "context" | "userProfile" | "aiCharacter" | null;

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
    console.error("Telegram bot error", error.error);
  });

  bot.command("start", async (ctx) => {
    if (ctx.from?.id) resetChatState(ctx.from.id);
    await ctx.reply(startText(ctx.from?.first_name), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply("Главное меню Rolka:", {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
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
    await ctx.editMessageText(startText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.callbackQuery("new_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    resetChatState(ctx.from.id);
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
      reply_markup: chatContextAfterKeyboard()
    });
  });

  bot.callbackQuery("chat_context_skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(chatUserProfileText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatUserProfileKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(chatUserProfileText(getChatState(ctx.from.id)), {
      parse_mode: "HTML",
      reply_markup: chatUserProfileKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_template", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "userProfile";
    await ctx.reply(userProfileTemplateText(), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_saved", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(savedUserProfilesText(), {
      parse_mode: "HTML",
      reply_markup: savedUserProfilesKeyboard()
    });
  });

  bot.callbackQuery(/^chat_user_profile_pick:/, async (ctx) => {
    await ctx.answerCallbackQuery("Твоя роль выбрана");
    const name = ctx.callbackQuery.data.replace("chat_user_profile_pick:", "");
    const state = getChatState(ctx.from.id);
    state.userProfileName = name;
    state.userProfile = sampleUserProfiles[name] ?? `Мой персонаж: ${name}`;
    state.awaiting = null;
    await ctx.editMessageText(userProfilePickedText(name), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_user_profile_skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(chatAiCharacterText(), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(chatAiCharacterText(), {
      parse_mode: "HTML",
      reply_markup: chatAiCharacterKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character_saved", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(savedCharactersText(), {
      parse_mode: "HTML",
      reply_markup: savedCharactersKeyboard()
    });
  });

  bot.callbackQuery("chat_ai_character_custom", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "aiCharacter";
    await ctx.reply(aiCharacterTemplateText(), {
      parse_mode: "HTML",
      reply_markup: chatModeStepKeyboard()
    });
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
    await ctx.editMessageText(chatModeStepText(), {
      parse_mode: "HTML",
      reply_markup: chatModeStepKeyboard()
    });
  });

  bot.callbackQuery(/^chat_ai_character_pick:/, async (ctx) => {
    await ctx.answerCallbackQuery("Персонаж AI выбран");
    const name = ctx.callbackQuery.data.replace("chat_ai_character_pick:", "");
    const state = getChatState(ctx.from.id);
    state.aiCharacter = sampleAiCharacters[name] ?? generatedAiCharacter;
    state.awaiting = null;
    await ctx.editMessageText(aiCharacterPickedText(state.aiCharacter.name), {
      parse_mode: "HTML",
      reply_markup: chatModeStepKeyboard()
    });
  });

  bot.callbackQuery("chat_mode_step", async (ctx) => {
    await ctx.answerCallbackQuery();
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
    await ctx.editMessageText(chatConfirmText(mode), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery("chat_start_confirmed", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
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
    await ctx.editMessageText(charactersText(), {
      parse_mode: "HTML",
      reply_markup: charactersKeyboard()
    });
  });

  bot.callbackQuery("character_template", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(characterTemplateText(), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("my_chats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(chatsText(), {
      parse_mode: "HTML",
      reply_markup: chatsKeyboard()
    });
  });

  bot.callbackQuery("context_export", async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = getChatState(ctx.from.id);
    await ctx.editMessageText(contextText(state), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("rp_modes", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(modesText(), {
      parse_mode: "HTML",
      reply_markup: modesKeyboard()
    });
  });

  bot.callbackQuery(/^mode:/, async (ctx) => {
    await ctx.answerCallbackQuery("Режим выбран");
    const mode = ctx.callbackQuery.data.replace("mode:", "");
    await ctx.reply(modeSelectedText(mode), {
      parse_mode: "HTML",
      reply_markup: chatContextKeyboard()
    });
  });

  bot.callbackQuery("image_mode", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(imageText(), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("adult_gate", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(adultText(), {
      parse_mode: "HTML",
      reply_markup: adultKeyboard()
    });
  });

  bot.callbackQuery("adult_gate_chat", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(adultChatText(), {
      parse_mode: "HTML",
      reply_markup: adultChatKeyboard()
    });
  });

  bot.callbackQuery("adult_accept", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    await ctx.reply(
      "✅ <b>Возраст и согласие отмечены.</b>\n\nТеперь 18+ режим можно будет использовать после подключения базы и сохранения профиля. Запрещенные категории все равно блокируются safety-фильтром.",
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() }
    );
  });

  bot.callbackQuery("adult_accept_chat", async (ctx) => {
    await ctx.answerCallbackQuery("18+ подтверждено");
    getChatState(ctx.from.id).mode = "ADULT";
    await ctx.editMessageText(chatConfirmText("18+ Adult"), {
      parse_mode: "HTML",
      reply_markup: chatConfirmKeyboard()
    });
  });

  bot.callbackQuery("subscription", async (ctx) => {
    await ctx.answerCallbackQuery();
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
    await ctx.editMessageText(rulesText(), {
      parse_mode: "HTML",
      reply_markup: backKeyboard()
    });
  });

  bot.callbackQuery("cabinet", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(cabinetText(), {
      parse_mode: "HTML",
      reply_markup: cabinetKeyboard()
    });
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    await ctx.reply("✅ <b>Подписка активирована.</b>\n\nЛимиты обновятся в профиле после подключения платежного сохранения.", {
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
    .text("🧠 Контекст", "context_export")
    .row()
    .text("⚙️ RP-режимы", "rp_modes")
    .text("🖼 Фото сцены", "image_mode")
    .row()
    .text("⭐ Подписка", "subscription")
    .text("🔞 18+ доступ", "adult_gate")
    .row()
    .text("📄 Правила", "rules")
    .text("🗝 Кабинет", "cabinet");
}

function backKeyboard() {
  return new InlineKeyboard().text("← Главное меню", "main_menu");
}

function chatContextKeyboard() {
  return new InlineKeyboard()
    .text("🧠 У меня есть старый контекст", "chat_context_have")
    .row()
    .text("Пропустить", "chat_context_skip")
    .text("← Главное меню", "main_menu");
}

function chatContextAfterKeyboard() {
  return new InlineKeyboard()
    .text("Дальше к анкете", "chat_user_profile")
    .text("Пропустить контекст", "chat_context_skip")
    .row()
    .text("← Главное меню", "main_menu");
}

function chatUserProfileKeyboard() {
  return new InlineKeyboard()
    .text("📝 Дать анкету о себе", "chat_user_profile_template")
    .text("👤 Мои персонажи", "chat_user_profile_saved")
    .row()
    .text("Пропустить", "chat_user_profile_skip")
    .text("← Назад к контексту", "new_chat");
}

function chatAiCharacterKeyboard() {
  return new InlineKeyboard()
    .text("👤 Мои персонажи", "chat_ai_character_saved")
    .text("✍️ Написать с нуля", "chat_ai_character_custom")
    .row()
    .text("✨ Пусть AI предложит", "chat_ai_character_generate")
    .row()
    .text("← Назад к анкете", "chat_user_profile");
}

function savedCharactersKeyboard() {
  return new InlineKeyboard()
    .text("Mira · пример", "chat_ai_character_pick:Mira")
    .text("Noah · пример", "chat_ai_character_pick:Noah")
    .row()
    .text("➕ Создать персонажа", "chat_ai_character_custom")
    .row()
    .text("← Назад", "chat_ai_character");
}

function savedUserProfilesKeyboard() {
  return new InlineKeyboard()
    .text("Mira · пример", "chat_user_profile_pick:Mira")
    .text("Noah · пример", "chat_user_profile_pick:Noah")
    .row()
    .text("✍️ Написать вручную", "chat_user_profile_template")
    .row()
    .text("← Назад к анкете", "chat_user_profile");
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
    .text("⭐ Снять лимиты", "subscription")
    .text("← Главное меню", "main_menu");
}

function charactersKeyboard() {
  return new InlineKeyboard()
    .text("➕ Шаблон анкеты", "character_template")
    .text("🎭 Использовать в чате", "chat_ai_character_saved")
    .row()
    .text("⭐ Снять лимит", "subscription")
    .text("← Главное меню", "main_menu");
}

function chatsKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Создать чат", "new_chat")
    .text("🧠 Экспорт контекста", "context_export")
    .row()
    .text("⭐ Удаление чатов в Plus", "subscription")
    .text("← Главное меню", "main_menu");
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

function cabinetKeyboard() {
  const keyboard = new InlineKeyboard();
  if (appUrl && isHttpsUrl(appUrl)) {
    keyboard.webApp("Открыть WebApp кабинет", appUrl).row();
  }
  return keyboard.text("← Главное меню", "main_menu");
}

function startText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, добро пожаловать в Rolka.</b>`,
    "",
    "Это RP-бот для переписок с персонажами через AI API.",
    "",
    "Здесь можно:",
    "• создавать и хранить своих персонажей;",
    "• запускать новые RP-чаты;",
    "• выбирать стиль roleplay;",
    "• переносить контекст старой переписки в новый чат;",
    "• генерировать фото/сцены;",
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
    "<i>Приоритет:</i> контекст → твоя анкета → персонаж для AI → режим → старт."
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
    "Пока база не подключена, бот не сохраняет этот текст автоматически, но flow уже построен правильно. После отправки нажми «Дальше»."
  ].join("\n");
}

function chatUserProfileText(state?: ChatDraft) {
  return [
    "📝 <b>Шаг 2 из 5 — твоя анкета для роли.</b>",
    "",
    state?.userProfileName ? `Сейчас выбрано: <b>${escapeHtml(state.userProfileName)}</b>` : "Сейчас анкета еще не выбрана.",
    "",
    "Теперь можно описать <b>твоего персонажа или себя в этой сцене</b>. Чем подробнее, тем лучше AI поймет динамику.",
    "",
    "Можно не писать заново: если у тебя уже есть готовый персонаж, выбери его кнопкой <b>«Мои персонажи»</b>.",
    "",
    "<b>Рекомендуется указать:</b>",
    "• имя или обращение;",
    "• возраст, если нужен 18+ режим;",
    "• внешность и манеру речи;",
    "• характер, желания, страхи;",
    "• границы и запреты;",
    "• какую динамику хочешь в RP.",
    "",
    "Если твоя роль не важна, можно пропустить."
  ].join("\n");
}

function savedUserProfilesText() {
  return [
    "👤 <b>Выбери свою роль из готовых персонажей</b>",
    "",
    "Этот персонаж будет использоваться как <b>твой персонаж</b> в сцене, а не как персонаж AI.",
    "",
    "После подключения базы здесь появятся твои реальные сохраненные анкеты. Сейчас показываю примерные кнопки, чтобы flow был понятным.",
    "",
    "<b>Важно:</b> на следующем шаге отдельно выбирается персонаж для AI."
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
    "После заполнения переходи к персонажу для AI."
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
    "Здесь будут твои сохраненные карточки из кабинета.",
    "",
    "Сейчас БД не подключена к Telegram-flow, поэтому показываю пример кнопок. После подключения здесь появятся реальные персонажи пользователя.",
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
    "После этого выбери RP-режим."
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

function chatConfirmText(mode: string) {
  return [
    "✅ <b>Шаг 5 из 5 — проверка перед стартом.</b>",
    "",
    `<b>Контекст:</b> ${"опционально"}`,
    `<b>Твоя анкета:</b> ${"опционально"}`,
    `<b>Персонаж AI:</b> ${"выбран"}`,
    `<b>Режим:</b> ${escapeHtml(mode)}`,
    "",
    "После старта Rolka соберет системный prompt: safety → стиль → режим → персонажи → контекст → последние сообщения.",
    "",
    "Нажми «Начать чат», если все готово."
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
    "Пока БД не подключена, можешь нажать «Шаблон анкеты» и заполнить ее вручную."
  ].join("\n");
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
    "Позже эта форма будет сохраняться в личном кабинете и открываться одной кнопкой."
  ].join("\n");
}

function chatsText() {
  return [
    "💬 <b>Мои чаты</b>",
    "",
    "Здесь будет список переписок с персонажами.",
    "",
    "<b>Free:</b> доступно 3 чата, удалять нельзя.",
    "<b>Plus/Pro:</b> можно создавать больше чатов и удалять/архивировать старые.",
    "",
    "Это сделано, чтобы Free-лимиты нельзя было обходить удалением."
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

function modeSelectedText(mode: string) {
  return `✅ <b>Режим выбран:</b> ${escapeHtml(mode)}\n\nТеперь можно создать чат, выбрать персонажа и начать сцену.`;
}

function imageText() {
  return [
    "🖼 <b>Фото / сцены</b>",
    "",
    "Режим будет брать описание персонажа и текущий контекст переписки, затем делать prompt для генерации изображения.",
    "",
    "<b>Free:</b> ограниченное количество генераций.",
    "<b>Plus/Pro:</b> больше лимитов и лучшие модели."
  ].join("\n");
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
  if (state.awaiting === "context") {
    state.context = content;
    state.awaiting = null;
    await reply("✅ <b>Контекст сохранен в черновик.</b>\n\nТеперь добавь свою анкету или выбери готового персонажа.", chatUserProfileKeyboard());
    return;
  }
  if (state.awaiting === "userProfile") {
    state.userProfile = content;
    state.userProfileName = "анкета вручную";
    state.awaiting = null;
    await reply("✅ <b>Твоя анкета сохранена.</b>\n\nТеперь выбери персонажа, которым будет отвечать AI.", chatAiCharacterKeyboard());
    return;
  }
  if (state.awaiting === "aiCharacter") {
    state.aiCharacter = parseManualAiCharacter(content);
    state.awaiting = null;
    await reply("✅ <b>Персонаж AI сохранен.</b>\n\nТеперь выбери режим RP.", chatModeStepKeyboard());
  }
}

async function handleActiveChatMessage(
  userId: number,
  chatId: number,
  content: string,
  sendAction: (action: "typing") => Promise<void>,
  reply: (text: string, keyboard?: InlineKeyboard) => Promise<void>
) {
  const state = getChatState(userId);
  const safety = validateSafetyText(content);
  if (!safety.ok) {
    await reply(`Сообщение заблокировано safety-фильтром: ${safety.reason}`, chatReadyKeyboard());
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
      temperature: 0.85
    });
    const answer = response.content || "Пустой ответ от модели. Попробуй отправить сообщение еще раз.";
    state.messages.push({ role: "assistant", content: answer });
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
