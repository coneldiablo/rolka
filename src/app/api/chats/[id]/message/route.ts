import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { sendMessageSchema } from "@/server/schemas";
import { sendChatMessage } from "@/server/services/chat-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const input = sendMessageSchema.parse(await request.json());
    const { userMessage, assistantMessage } = await sendChatMessage({ userId: user.id, chatId: id, content: input.content });
    return jsonOk({ userMessage, assistantMessage });
  } catch (error) {
    return handleApiError(error);
  }
}
