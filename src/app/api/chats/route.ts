import { assertCanCreateChat } from "@/domain/plans";
import { validateAdultCharacters, validateAdultGate } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan, getCurrentUser } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/server/api";
import { chatSchema } from "@/server/schemas";

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
    const plan = await getCurrentPlan(user.id);
    const count = await prisma.chat.count({ where: { userId: user.id, status: { not: "DELETED" } } });
    assertCanCreateChat(plan, count);

    const input = chatSchema.parse(await request.json());
    const characters = await prisma.character.findMany({
      where: { userId: user.id, id: { in: input.characterIds } }
    });
    if (characters.length !== input.characterIds.length) {
      return jsonError("CHARACTER_NOT_FOUND", "One or more characters do not exist.", 404);
    }

    const gate = validateAdultGate(user, input.mode);
    if (!gate.ok) return jsonError(gate.code, gate.reason, 403);

    const adultCharacters = validateAdultCharacters(input.mode, characters);
    if (!adultCharacters.ok) {
      await prisma.moderationEvent.create({
        data: { userId: user.id, severity: "BLOCKED", reason: adultCharacters.reason, input: JSON.stringify(input) }
      });
      return jsonError(adultCharacters.code, adultCharacters.reason, 422);
    }

    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title: input.title,
        mode: input.mode,
        lorebook: input.lorebook,
        importedContext: input.importedContext,
        characters: {
          create: input.characterIds.map((characterId) => ({ characterId }))
        }
      },
      include: { characters: { include: { character: true } } }
    });
    return jsonOk(chat, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
