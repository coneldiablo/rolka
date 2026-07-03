import { PLAN_LIMITS } from "@/domain/plans";
import { prisma } from "@/lib/prisma";
import { getCurrentPlan, getCurrentUser, ensureDefaultSubscription } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    await ensureDefaultSubscription(user.id);
    const plan = await getCurrentPlan(user.id);
    const [characters, chats] = await Promise.all([
      prisma.character.count({ where: { userId: user.id } }),
      prisma.chat.count({ where: { userId: user.id, status: { not: "DELETED" } } })
    ]);

    return jsonOk({
      user,
      plan,
      limits: PLAN_LIMITS[plan],
      usage: { characters, chats }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
