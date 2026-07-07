import { assertCanCreateCharacter } from "@/domain/plans";
import type { PromptCharacter } from "@/domain/prompts";
import { validateSafetyText } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan } from "@/server/auth";

export type CreateCharacterInput = PromptCharacter;

export async function createCharacterForUser(userId: string, input: CreateCharacterInput) {
  const plan = await getCurrentPlan(userId);
  const count = await prisma.character.count({ where: { userId } });
  assertCanCreateCharacter(plan, count);

  const safety = validateSafetyText([input.description, input.starterScene, input.boundaries].filter(Boolean).join("\n"));
  if (!safety.ok) {
    await prisma.moderationEvent.create({
      data: { userId, severity: "BLOCKED", reason: safety.reason, input: JSON.stringify(input) }
    });
    throw new Error(safety.code);
  }

  return prisma.character.create({
    data: {
      ...input,
      userId,
      isAdultReady: input.age >= 18
    }
  });
}

export async function findOrCreateCharacterForTelegramUser(telegramUserId: number, character: PromptCharacter) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramUserId) } });
  if (!user) return null;

  const existing = await prisma.character.findFirst({
    where: {
      userId: user.id,
      name: character.name,
      description: character.description
    },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return existing;

  return prisma.character.create({
    data: {
      ...character,
      userId: user.id,
      isAdultReady: character.age >= 18
    }
  });
}
