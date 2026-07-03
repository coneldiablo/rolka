import { assertCanCreateCharacter } from "@/domain/plans";
import { validateSafetyText } from "@/domain/safety";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan, getCurrentUser } from "@/server/auth";
import { handleApiError, jsonError, jsonOk } from "@/server/api";
import { characterSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const characters = await prisma.character.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });
    return jsonOk(characters);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const plan = await getCurrentPlan(user.id);
    const count = await prisma.character.count({ where: { userId: user.id } });
    assertCanCreateCharacter(plan, count);

    const input = characterSchema.parse(await request.json());
    const safety = validateSafetyText([input.description, input.starterScene, input.boundaries].filter(Boolean).join("\n"));
    if (!safety.ok) {
      await prisma.moderationEvent.create({
        data: { userId: user.id, severity: "BLOCKED", reason: safety.reason, input: JSON.stringify(input) }
      });
      return jsonError(safety.code, safety.reason, 422);
    }

    const character = await prisma.character.create({
      data: {
        ...input,
        userId: user.id,
        isAdultReady: input.age >= 18
      }
    });
    return jsonOk(character, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
