import { assertCanCreateChat, assertCanDeleteChat, assertCanSendAdultMessage } from "@/domain/plans";
import { buildPrompt, type PromptCharacter, type PromptMessage } from "@/domain/prompts";
import { createConfiguredTextProviders, generateWithFallback } from "@/domain/providers";
import { validateAdultCharacters, validateAdultGate, validateSafetyText } from "@/domain/safety";
import type { RpMode } from "@/domain/modes";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan } from "@/server/auth";

export type CreateChatInput = {
  title: string;
  mode: RpMode;
  characterIds: string[];
  lorebook?: string | null;
  memorySummary?: string | null;
  importedContext?: string | null;
};

export type SendChatMessageInput = {
  userId: string;
  chatId: string;
  content: string;
  temperature?: number;
};

export async function createChatForUser(userId: string, input: CreateChatInput) {
  const plan = await getCurrentPlan(userId);
  const count = await prisma.chat.count({ where: { userId, status: { not: "DELETED" } } });
  assertCanCreateChat(plan, count);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");

  const characters = await prisma.character.findMany({
    where: { userId, id: { in: input.characterIds } }
  });
  if (characters.length !== input.characterIds.length) throw new Error("CHARACTER_NOT_FOUND");

  const gate = validateAdultGate(user, input.mode);
  if (!gate.ok) throw new Error(gate.code);

  const adultCharacters = validateAdultCharacters(input.mode, characters);
  if (!adultCharacters.ok) {
    await prisma.moderationEvent.create({
      data: { userId, severity: "BLOCKED", reason: adultCharacters.reason, input: JSON.stringify(input) }
    });
    throw new Error(adultCharacters.code);
  }

  return prisma.chat.create({
    data: {
      userId,
      title: input.title,
      mode: input.mode,
      lorebook: input.lorebook,
      memorySummary: input.memorySummary,
      importedContext: input.importedContext,
      characters: {
        create: input.characterIds.map((characterId) => ({ characterId }))
      }
    },
    include: { characters: { include: { character: true } } }
  });
}

export async function appendChatMessage(input: {
  userId: string;
  chatId: string;
  role: PromptMessage["role"];
  content: string;
  provider?: string;
  model?: string;
}) {
  return prisma.message.create({
    data: {
      userId: input.userId,
      chatId: input.chatId,
      role: input.role === "assistant" ? "ASSISTANT" : input.role === "system" ? "SYSTEM" : "USER",
      content: input.content,
      provider: input.provider,
      model: input.model
    }
  });
}

export async function sendChatMessage(input: SendChatMessageInput) {
  const safety = validateSafetyText(input.content);
  if (!safety.ok) throw new Error(safety.code);

  const chat = await prisma.chat.findFirst({
    where: { id: input.chatId, userId: input.userId, status: "ACTIVE" },
    include: {
      characters: { include: { character: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 24 }
    }
  });
  if (!chat) throw new Error("CHAT_NOT_FOUND");

  const plan = await getCurrentPlan(input.userId);
  if (chat.mode === "ADULT") {
    assertCanSendAdultMessage(plan, chat.adultMessageCount);
  }

  const userMessage = await appendChatMessage({
    userId: input.userId,
    chatId: chat.id,
    role: "user",
    content: input.content
  });

  const recentMessages: PromptMessage[] = [...chat.messages]
    .reverse()
    .map((message): PromptMessage => ({
      role: message.role === "ASSISTANT" ? "assistant" : message.role === "SYSTEM" ? "system" : "user",
      content: message.content
    }));

  const prompt = buildPrompt({
    mode: chat.mode,
    characters: chat.characters.map(({ character }) => character as PromptCharacter),
    lorebook: chat.lorebook,
    memorySummary: chat.memorySummary,
    importedContext: chat.importedContext,
    recentMessages: [...recentMessages, { role: "user", content: input.content }]
  });

  const ai = await generateWithFallback(createConfiguredTextProviders(), { messages: prompt, temperature: input.temperature });
  const assistantMessage = await appendChatMessage({
    userId: input.userId,
    chatId: chat.id,
    role: "assistant",
    content: ai.content,
    provider: ai.provider,
    model: ai.model
  });

  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      updatedAt: new Date(),
      adultMessageCount: chat.mode === "ADULT" ? { increment: 1 } : undefined
    }
  });

  return { userMessage, assistantMessage };
}

export async function deleteChatForUser(userId: string, chatId: string) {
  const plan = await getCurrentPlan(userId);
  assertCanDeleteChat(plan);
  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId, status: { not: "DELETED" } } });
  if (!chat) throw new Error("CHAT_NOT_FOUND");
  return prisma.chat.update({ where: { id: chat.id }, data: { status: "DELETED" } });
}
