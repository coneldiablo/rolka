import { exportContext } from "@/domain/context-export";
import type { PromptCharacter, PromptMessage } from "@/domain/prompts";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/server/api";

export const runtime = "nodejs";

type ChatForContextExport = {
  id: string;
  title: string;
  mode: string;
  lorebook: string | null;
  memorySummary: string | null;
  characters: Array<{ character: PromptCharacter }>;
  messages: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM"; content: string }>;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const chat: ChatForContextExport | null = await prisma.chat.findFirst({
      where: { id, userId: user.id, status: { not: "DELETED" } },
      include: {
        characters: { include: { character: true } },
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!chat) return jsonError("CHAT_NOT_FOUND", "Chat not found.", 404);

    const snapshot = exportContext({
      title: chat.title,
      mode: chat.mode,
      characters: chat.characters.map(({ character }) => character),
      lorebook: chat.lorebook,
      memorySummary: chat.memorySummary,
      messages: chat.messages.map((message): PromptMessage => ({
        role: message.role === "ASSISTANT" ? "assistant" : message.role === "SYSTEM" ? "system" : "user",
        content: message.content
      }))
    });

    const saved = await prisma.contextSnapshot.create({
      data: {
        userId: user.id,
        chatId: chat.id,
        ...snapshot
      }
    });

    return jsonOk(saved);
  } catch (error) {
    return handleApiError(error);
  }
}
