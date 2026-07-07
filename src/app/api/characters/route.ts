import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { characterSchema } from "@/server/schemas";
import { createCharacterForUser } from "@/server/services/character-service";

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
    const input = characterSchema.parse(await request.json());
    const character = await createCharacterForUser(user.id, input);
    return jsonOk(character, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
