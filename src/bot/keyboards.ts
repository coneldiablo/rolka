import { InlineKeyboard } from "grammy";
import { getPlanPriceStars } from "@/domain/plans";
import type { RpMode } from "@/domain/modes";
import { getUserProfile } from "./sessions";
import type { AwaitingInput, SavedChat } from "./types";
import { adminUserLabel } from "./utils";

export const modeButtonLabels: Record<RpMode, string> = {
  CLASSIC: "🎭 Обычная",
  CINEMATIC: "🎬 Киношная",
  DIALOGUE_FOCUS: "💬 Диалоги",
  SLOW_BURN: "❤️ Медленная",
  ADVENTURE_GM: "🧭 Приключение",
  DARK_DRAMA: "🕯 Темная драма",
  ADULT: "🔞 18+",
  PHOTO_SCENE: "🖼 Фото сцены"
};

export function modeButtonLabel(mode: RpMode) {
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

export function backKeyboard() {
  return new InlineKeyboard().text("← Главное меню", "main_menu");
}

export function awaitingInputKeyboard(backCallback: string) {
  return new InlineKeyboard().text("← Назад", backCallback).text("← Главное меню", "main_menu");
}

export function onboardingStartKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Начать первую ролку", "onboarding_start")
    .row()
    .text("❔ Как это работает", "onboarding_how");
}

export function onboardingGoalKeyboard() {
  return new InlineKeyboard()
    .text("❤️ Медленное сближение", "onboarding_goal:slow")
    .row()
    .text("🕯 Темная драма", "onboarding_goal:dark")
    .row()
    .text("🧭 Приключение", "onboarding_goal:adventure")
    .row()
    .text("✍️ Свой персонаж", "onboarding_goal:custom");
}

export function onboardingCharacterKeyboard() {
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

export function onboardingStyleKeyboard() {
  return new InlineKeyboard()
    .text(modeButtonLabel("CLASSIC"), "onboarding_style:classic")
    .row()
    .text(modeButtonLabel("SLOW_BURN"), "onboarding_style:slow")
    .row()
    .text(modeButtonLabel("DARK_DRAMA"), "onboarding_style:dark");
}

export function onboardingFirstMessageKeyboard() {
  return new InlineKeyboard()
    .text("✍️ Написать самому", "onboarding_write_self")
    .row()
    .text("✨ Дай стартовую сцену", "onboarding_starter_scene");
}

export function newChatKeyboard(userId?: number) {
  return savedUserProfilesKeyboard(userId);
}

export function chatContextAwaitingKeyboard() {
  return new InlineKeyboard()
    .text("Дальше к персонажу", "chat_ai_character")
    .row()
    .text("Без старого сюжета", "chat_context_skip")
    .text("← Главное меню", "main_menu");
}

export function contextSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к моей роли", "chat_user_profile")
    .row()
    .text("Изменить контекст", "chat_context_have")
    .text("← Главное меню", "main_menu");
}

export function chatUserProfileKeyboard() {
  return new InlineKeyboard()
    .text("📝 Дать анкету о себе", "chat_user_profile_template")
    .text("🧍 Мои роли", "chat_user_profile_saved")
    .row()
    .text("Пропустить", "chat_user_profile_skip")
    .text("← Назад", "chat_context_step");
}

export function userProfileInputKeyboard() {
  return new InlineKeyboard()
    .text("Пропустить выбор", "chat_user_profile_skip")
    .row()
    .text("← Назад к выбору персонажа", "chat_user_profile")
    .text("← Главное меню", "main_menu");
}

export function userProfileSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к персонажу AI", "chat_ai_character")
    .row()
    .text("Изменить мою роль", "chat_user_profile")
    .text("← Назад к выбору", "chat_user_profile");
}

export function chatAiCharacterKeyboard() {
  return savedCharactersKeyboard();
}

export function aiCharacterInputKeyboard() {
  return new InlineKeyboard()
    .text("← Назад к персонажу AI", "chat_ai_character")
    .text("← Главное меню", "main_menu");
}

export function aiCharacterSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к замыслу сцены", "scene_brief_skip")
    .row()
    .text("Изменить персонажа AI", "chat_ai_character")
    .text("← Назад к персонажу", "chat_user_profile");
}

export function savedCharactersKeyboard(userId?: number) {
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

export function savedUserProfilesKeyboard(userId?: number) {
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

export function sceneBriefSavedKeyboard() {
  return new InlineKeyboard()
    .text("Продолжить к стилю", "chat_mode_step")
    .row()
    .text("Изменить замысел", "scene_brief_write")
    .text("Пропустить", "scene_brief_skip");
}

export function aiGeneratedCharacterKeyboard() {
  return new InlineKeyboard()
    .text("✅ Взять этого", "chat_ai_character_accept_generated")
    .text("🔄 Другой вариант", "chat_ai_character_generate")
    .row()
    .text("➕ Создать персонажа", "chat_ai_character_create")
    .text("← Назад", "chat_ai_character");
}

export function sceneBriefKeyboard() {
  return new InlineKeyboard()
    .text("✍️ Описать замысел", "scene_brief_write")
    .row()
    .text("Пропустить", "scene_brief_skip")
    .text("← Назад к AI", "chat_ai_character");
}

export function sceneBriefInputKeyboard() {
  return new InlineKeyboard()
    .text("Пропустить", "scene_brief_skip")
    .row()
    .text("← К стилю без замысла", "scene_brief_skip")
    .text("← Главное меню", "main_menu");
}

export function chatModeStepKeyboard() {
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

export function chatConfirmKeyboard() {
  return new InlineKeyboard()
    .text("✅ Начать чат", "chat_start_confirmed")
    .row()
    .text("⚙️ Изменить режим", "chat_mode_step")
    .text("🤖 Изменить AI", "chat_ai_character")
    .row()
    .text("← Главное меню", "main_menu");
}

export function chatReadyKeyboard() {
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

export function confirmStopChatKeyboard() {
  return new InlineKeyboard()
    .text("⏸ Да, остановить", "confirm_stop_active_chat")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

export function confirmSaveAndExitKeyboard() {
  return new InlineKeyboard()
    .text("💾 Да, сохранить", "confirm_save_and_exit")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

export function confirmDeleteActiveChatKeyboard() {
  return new InlineKeyboard()
    .text("🗑 Да, удалить", "confirm_delete_active_chat")
    .row()
    .text("← Вернуться в ролку", "cancel_exit_active_chat");
}

export function valueCheckpointKeyboard() {
  return new InlineKeyboard()
    .text("🧠 Сводка сцены", "memory_save")
    .row()
    .text("▶️ Продолжить бесплатно", "continue_free")
    .row()
    .text("⭐ Что дает Plus", "subscription");
}

export function nonAdultModeRedirectKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Продолжить без 18+", "continue_free")
    .row()
    .text("🔞 Перейти в 18+ режим", "adult_gate_chat")
    .row()
    .text("🎛 Сменить стиль", "chat_mode_step")
    .text("← Главное меню", "main_menu");
}

export function stoppedChatKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Новая ролка", "new_chat")
    .text("🧠 Сводка", "context_export")
    .row()
    .text("⭐ Plus / Pro", "subscription")
    .text("← Главное меню", "main_menu");
}

export function charactersKeyboard() {
  return new InlineKeyboard()
    .text("➕ Создать персонажа", "library_character_create")
    .text("📋 Шаблон", "character_template")
    .row()
    .text("🎭 Использовать в ролке", "chat_ai_character_saved")
    .row()
    .text("⭐ Безлимит персонажей", "subscription")
    .text("← Главное меню", "main_menu");
}

export function modeSelectedKeyboard() {
  return new InlineKeyboard()
    .text("🎭 Создать чат с этим режимом", "new_chat")
    .row()
    .text("⚙️ Другой режим", "rp_modes")
    .text("← Главное меню", "main_menu");
}

export function chatsKeyboard(userId: number) {
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

export function savedChatKeyboard(chat?: SavedChat) {
  if (!chat) return new InlineKeyboard().text("← Мои ролки", "my_chats").text("← Главное меню", "main_menu");
  return new InlineKeyboard()
    .text("▶️ Продолжить эту ролку", `continue_saved_chat:${chat.id}`)
    .row()
    .text("🧠 Показать сводку", `saved_chat_context:${chat.id}`)
    .row()
    .text("🗑 Удалить", `delete_saved_chat:${chat.id}`)
    .text("← Мои ролки", "my_chats");
}

export function deleteChatKeyboard(userId: number) {
  const keyboard = new InlineKeyboard();
  const chats = getUserProfile(userId).savedChats;
  chats.slice(0, 8).forEach((chat) => {
    keyboard.text(`Удалить: ${chat.title}`, `delete_chat:${chat.id}`).row();
  });
  return keyboard.text("← Назад", "my_chats");
}

export function modesKeyboard() {
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

export function adultKeyboard() {
  return new InlineKeyboard()
    .text("✅ Мне есть 18 лет", "adult_accept")
    .text("📄 Правила", "rules")
    .row()
    .text("⭐ Plus / Pro", "subscription")
    .text("← Главное меню", "main_menu");
}

export function adultChatKeyboard() {
  return new InlineKeyboard()
    .text("✅ Мне есть 18 лет", "adult_accept_chat")
    .text("📄 Правила", "rules")
    .row()
    .text("← Назад к режимам", "chat_mode_step")
    .text("← Главное меню", "main_menu");
}

export function subscriptionKeyboard() {
  return new InlineKeyboard()
    .text(`Plus · ${getPlanPriceStars("PLUS")} Stars`, "subscribe_plus")
    .text(`Pro · ${getPlanPriceStars("PRO")} Stars`, "subscribe_pro")
    .row()
    .text("← Главное меню", "main_menu");
}

export function adminPanelKeyboard() {
  return new InlineKeyboard()
    .text("Участники", "admin_users")
    .text("Продажи", "admin_stats")
    .row()
    .text("Добавить админа", "admin_add_admin");
}

export function adminUsersKeyboard(users: Array<{ telegramId: string | null; displayName: string | null; username: string | null }>) {
  const keyboard = new InlineKeyboard();
  users.forEach((user) => {
    if (!user.telegramId) return;
    keyboard.text(adminUserLabel(user), `admin_user:${user.telegramId}`).row();
  });
  return keyboard.text("Обновить", "admin_users").text("← Админка", "admin_panel");
}

export function adminUserKeyboard(telegramId: string) {
  return new InlineKeyboard()
    .text("Выдать Free", `admin_grant:${telegramId}:FREE`)
    .row()
    .text("Выдать Plus", `admin_grant:${telegramId}:PLUS`)
    .text("Выдать Pro", `admin_grant:${telegramId}:PRO`)
    .row()
    .text("← Участники", "admin_users")
    .text("← Админка", "admin_panel");
}

export function startAgeGateKeyboard() {
  return new InlineKeyboard().text("✅ Мне есть 18 лет", "start_age_accept").row().text("📄 Правила", "rules");
}

export function characterInputKeyboard(target: Extract<AwaitingInput, "libraryCharacter" | "chatAiCharacter" | "chatUserCharacter">) {
  if (target === "chatAiCharacter") {
    return new InlineKeyboard().text("← Назад к персонажу AI", "chat_ai_character").text("← Главное меню", "main_menu");
  }
  if (target === "chatUserCharacter") {
    return new InlineKeyboard().text("← Назад к твоей анкете", "chat_user_profile").text("← Главное меню", "main_menu");
  }
  return awaitingInputKeyboard("characters");
}

