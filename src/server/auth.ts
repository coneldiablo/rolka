import { prisma } from "@/lib/prisma";
import { readTelegramInitData, verifyTelegramInitData } from "@/server/telegram-auth";

function configuredAdminTelegramIds() {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export async function getCurrentUser(request: Request) {
  const url = new URL(request.url);
  const initData = readTelegramInitData(request);
  const isProduction = process.env.NODE_ENV === "production";
  let telegramId: string | undefined;
  let username: string | undefined;
  let displayName: string | undefined;

  if (initData) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN_REQUIRED");
    const verified = verifyTelegramInitData(initData, token);
    telegramId = verified.telegramId;
    username = verified.username;
    displayName = verified.displayName;
  } else if (!isProduction) {
    telegramId = request.headers.get("x-telegram-id") ?? url.searchParams.get("telegramId") ?? process.env.DEV_TELEGRAM_ID ?? "dev-user";
    username = request.headers.get("x-telegram-username") ?? undefined;
    displayName = request.headers.get("x-telegram-name") ?? username ?? "Demo user";
  } else {
    throw new Error("TELEGRAM_AUTH_REQUIRED");
  }

  const isConfiguredAdmin = configuredAdminTelegramIds().has(telegramId);

  return prisma.user.upsert({
    where: { telegramId },
    update: { username, displayName, ...(isConfiguredAdmin ? { isAdmin: true } : {}) },
    create: { telegramId, username, displayName, isAdmin: isConfiguredAdmin }
  });
}

export async function getCurrentPlan(userId: string): Promise<"FREE" | "PLUS" | "PRO"> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (user?.isAdmin) return "PRO";

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
