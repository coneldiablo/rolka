import type { PromptCharacter } from "@/domain/prompts";
import { findOrCreateCharacterForTelegramUser } from "@/server/services/character-service";
import { Bot, InlineKeyboard } from "grammy";
import { generatedAiCharacter, generatedAiCharacterVariants, sampleAiCharacters } from "../catalog";
import {
  aiGeneratedCharacterKeyboard,
  characterInputKeyboard,
  charactersKeyboard,
  savedCharactersKeyboard,
  sceneBriefKeyboard,
  subscriptionKeyboard
} from "../keyboards";
import { getChatState, getUserProfile } from "../sessions";
import {
  aiGeneratedCharacterText,
  characterCreateText,
  characterLimitText,
  characterTemplateText,
  charactersText,
  libraryCharacterSavedText,
  savedCharactersText,
  sceneBriefText
} from "../texts";
import type { AwaitingInput, SavedCharacter, TelegramFrom } from "../types";
import { createRuntimeId, freeCharacterLimit } from "../utils";

type CharacterFlowDeps = {
  syncTelegramUser: (from: TelegramFrom) => Promise<unknown>;
};

type CharacterReply = (text: string, keyboard: InlineKeyboard) => Promise<void>;

export function registerCharactersFlow(bot: Bot, deps: CharacterFlowDeps) {
  bot.callbackQuery("characters", async (ctx) => {
    await ctx.answerCallbackQuery();
    await deps.syncTelegramUser(ctx.from);
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
    await deps.syncTelegramUser(ctx.from);
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
}

export async function handleCharacterAwaitingInput(
  userId: number,
  content: string,
  reply: CharacterReply
): Promise<boolean> {
  const state = getChatState(userId);
  if (state.awaiting === "aiCharacter") {
    state.aiCharacter = parseManualAiCharacter(content);
    state.awaiting = null;
    await reply(sceneBriefText(state), sceneBriefKeyboard());
    return true;
  }

  if (
    state.awaiting !== "libraryCharacter" &&
    state.awaiting !== "chatAiCharacter" &&
    state.awaiting !== "chatUserCharacter"
  ) {
    return false;
  }

  const profile = getUserProfile(userId);
  const character = await persistCharacterForTelegramUser(userId, parseManualAiCharacter(content));
  profile.characters.push(character);
  const target = state.awaiting;
  state.awaiting = null;

  if (target === "chatAiCharacter") {
    state.aiCharacter = character;
    await reply(sceneBriefText(state), sceneBriefKeyboard());
    return true;
  }

  if (target === "chatUserCharacter") {
    state.userProfileName = character.name;
    state.userProfile = renderUserProfileFromCharacter(character);
    await reply(savedCharactersText(state), savedCharactersKeyboard(userId));
    return true;
  }

  await reply(libraryCharacterSavedText(character), charactersKeyboard());
  return true;
}

export async function startCharacterInput(
  userId: number,
  render: CharacterReply,
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

export async function persistCharacterForTelegramUser(userId: number, character: PromptCharacter): Promise<SavedCharacter> {
  const created = await findOrCreateCharacterForTelegramUser(userId, character);
  if (!created) return { ...character, id: createRuntimeId() };
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

export function nextGeneratedCharacter(userId: number) {
  const profile = getUserProfile(userId);
  const character = generatedAiCharacterVariants[profile.generatedCharacterVariantIndex % generatedAiCharacterVariants.length];
  profile.generatedCharacterVariantIndex += 1;
  getChatState(userId).aiCharacter = character;
  return character;
}

export function findSavedCharacter(userId: number, idOrName: string): SavedCharacter | undefined {
  return getUserProfile(userId).characters.find((character) => character.id === idOrName || character.name === idOrName);
}

export function renderUserProfileFromCharacter(character: PromptCharacter) {
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
