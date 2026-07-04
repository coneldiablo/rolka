import { assertCanSendAdultMessage } from "@/domain/plans";
import { buildPrompt, type PromptCharacter, type PromptMessage } from "@/domain/prompts";
import type { RpMode } from "@/domain/modes";
import { generateWithFallback, createConfiguredTextProviders } from "@/domain/providers";
import { validateSafetyText } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan, getCurrentUser } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/server/api";
import { sendMessageSchema } from "@/server/schemas";

export const runtime = "nodejs";

type ChatForMessage = {
  id: string;
  mode: RpMode;
  adultMessageCount: number;
  lorebook: string | null;
  memorySummary: string | null;
  importedContext: string | null;
  characters: Array<{ character: PromptCharacter }>;
  messages: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM"; content: string }>;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const input = sendMessageSchema.parse(await request.json());
    const safety = validateSafetyText(input.content);
    if (!safety.ok) return jsonError(safety.code, safety.reason, 422);

    const chat: ChatForMessage | null = await prisma.chat.findFirst({
      where: { id, userId: user.id, status: "ACTIVE" },
      include: {
        characters: { include: { character: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 24 }
      }
    });
    if (!chat) return jsonError("CHAT_NOT_FOUND", "Chat not found.", 404);

    const plan = await getCurrentPlan(user.id);
    if (chat.mode === "ADULT") {
      assertCanSendAdultMessage(plan, chat.adultMessageCount);
    }

    const userMessage = await prisma.message.create({
      data: { userId: user.id, chatId: chat.id, role: "USER", content: input.content }
    });

    const recentMessages: PromptMessage[] = [...chat.messages]
      .reverse()
      .map((message): PromptMessage => ({
        role: message.role === "ASSISTANT" ? "assistant" : message.role === "SYSTEM" ? "system" : "user",
        content: message.content
      }));

    const prompt = buildPrompt({
      mode: chat.mode,
      characters: chat.characters.map(({ character }) => character),
      lorebook: chat.lorebook,
      memorySummary: chat.memorySummary,
      importedContext: chat.importedContext,
      recentMessages: [...recentMessages, { role: "user", content: input.content }]
    });

    const ai = await generateWithFallback(createConfiguredTextProviders(), { messages: prompt });
    const assistantMessage = await prisma.message.create({
      data: {
        userId: user.id,
        chatId: chat.id,
        role: "ASSISTANT",
        content: ai.content,
        provider: ai.provider,
        model: ai.model
      }
    });

    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        updatedAt: new Date(),
        adultMessageCount: chat.mode === "ADULT" ? { increment: 1 } : undefined
      }
    });

    return jsonOk({ userMessage, assistantMessage });
  } catch (error) {
    return handleApiError(error);
  }
}
