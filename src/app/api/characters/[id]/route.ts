import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { characterSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser(request);
    const input = characterSchema.partial().parse(await request.json());
    const existing = await prisma.character.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return Response.json({ ok: false, error: { code: "CHARACTER_NOT_FOUND", message: "Character not found." } }, { status: 404 });
    }
    const character = await prisma.character.update({
      where: { id },
      data: { ...input, isAdultReady: input.age ? input.age >= 18 : undefined }
    });
    return jsonOk(character);
  } catch (error) {
    return handleApiError(error);
  }
}
