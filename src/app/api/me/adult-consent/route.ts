import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { acceptAdultSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    acceptAdultSchema.parse(await request.json());
    const user = await getCurrentUser(request);
    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ageVerifiedAt: now,
        termsAcceptedAt: now,
        privacyAcceptedAt: now
      }
    });
    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
