import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PersistedBotSession<TDraft> = {
  awaiting: string | null;
  activeChatId: string | null;
  draft: TDraft;
};

export async function loadBotSession<TDraft>(telegramId: number): Promise<PersistedBotSession<TDraft> | null> {
  const session = await prisma.botSession.findUnique({ where: { telegramId: String(telegramId) } });
  if (!session) return null;
  return {
    awaiting: session.awaiting,
    activeChatId: session.activeChatId,
    draft: session.draftJson as TDraft
  };
}

export async function saveBotSession<TDraft extends Record<string, unknown>>(
  telegramId: number,
  draft: TDraft,
  options: { userId?: string; awaiting?: string | null; activeChatId?: string | null } = {}
) {
  return prisma.botSession.upsert({
    where: { telegramId: String(telegramId) },
    update: {
      userId: options.userId,
      awaiting: options.awaiting,
      activeChatId: options.activeChatId,
      draftJson: draft as Prisma.InputJsonValue
    },
    create: {
      telegramId: String(telegramId),
      userId: options.userId,
      awaiting: options.awaiting,
      activeChatId: options.activeChatId,
      draftJson: draft as Prisma.InputJsonValue
    }
  });
}

export async function clearBotSession(telegramId: number) {
  await prisma.botSession.deleteMany({ where: { telegramId: String(telegramId) } });
}
