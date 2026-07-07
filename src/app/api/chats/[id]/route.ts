import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/server/api";
import { deleteChatForUser } from "@/server/services/chat-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const chat = await prisma.chat.findFirst({
      where: { id, userId: user.id, status: { not: "DELETED" } },
      include: {
        characters: { include: { character: true } },
        messages: { orderBy: { createdAt: "asc" } },
        snapshots: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
    if (!chat) return jsonError("CHAT_NOT_FOUND", "Chat not found.", 404);
    return jsonOk(chat);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const deleted = await deleteChatForUser(user.id, id);
    return jsonOk(deleted);
  } catch (error) {
    return handleApiError(error);
  }
}
