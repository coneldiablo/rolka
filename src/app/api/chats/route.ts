import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { chatSchema } from "@/server/schemas";
import { createChatForUser } from "@/server/services/chat-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const chats = await prisma.chat.findMany({
      where: { userId: user.id, status: { not: "DELETED" } },
      include: { characters: { include: { character: true } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" }
    });
    return jsonOk(chats);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const input = chatSchema.parse(await request.json());
    const chat = await createChatForUser(user.id, input);
    return jsonOk(chat, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
