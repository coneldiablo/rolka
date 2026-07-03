import { prisma } from "@/lib/prisma";

export async function getCurrentUser(request: Request) {
  const url = new URL(request.url);
  const telegramId =
    request.headers.get("x-telegram-id") ??
    url.searchParams.get("telegramId") ??
    process.env.DEV_TELEGRAM_ID ??
    "dev-user";

  const username = request.headers.get("x-telegram-username") ?? undefined;
  const displayName = request.headers.get("x-telegram-name") ?? username ?? "Demo user";

  return prisma.user.upsert({
    where: { telegramId },
    update: { username, displayName },
    create: { telegramId, username, displayName }
  });
}

export async function getCurrentPlan(userId: string): Promise<"FREE" | "PLUS" | "PRO"> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
    },
    orderBy: { createdAt: "desc" }
  });
  return subscription?.plan ?? "FREE";
}

export async function ensureDefaultSubscription(userId: string) {
  const existing = await prisma.subscription.findFirst({ where: { userId } });
  if (existing) return existing;
  return prisma.subscription.create({
    data: {
      userId,
      plan: "FREE",
      status: "ACTIVE"
    }
  });
}
