import { getPlanPriceStars, type Plan } from "@/domain/plans";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RecordTelegramPaymentInput = {
  userId: string;
  plan: Exclude<Plan, "FREE">;
  telegramPaymentChargeId: string;
  payload: Prisma.InputJsonValue;
};

export async function recordSuccessfulTelegramStarsPayment(input: RecordTelegramPaymentInput) {
  const amount = getPlanPriceStars(input.plan);
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findFirst({
      where: {
        provider: "TELEGRAM_STARS",
        providerPaymentId: input.telegramPaymentChargeId
      }
    });
    if (existing) return existing;

    const payment = await tx.payment.create({
      data: {
        userId: input.userId,
        provider: "TELEGRAM_STARS",
        providerPaymentId: input.telegramPaymentChargeId,
        plan: input.plan,
        amount,
        currency: "XTR",
        status: "PAID",
        payload: input.payload
      }
    });

    await tx.subscription.updateMany({
      where: { userId: input.userId, status: "ACTIVE" },
      data: { status: "CANCELED", endsAt: new Date() }
    });

    await tx.subscription.create({
      data: {
        userId: input.userId,
        plan: input.plan,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt
      }
    });

    return payment;
  });
}

export async function recordSuccessfulTelegramStarsPaymentForTelegramUser(
  telegramUserId: number,
  plan: Exclude<Plan, "FREE">,
  telegramPaymentChargeId: string,
  payload: Prisma.InputJsonValue
) {
  const user = await prisma.user.findUnique({ where: { telegramId: String(telegramUserId) } });
  if (!user) return null;
  return recordSuccessfulTelegramStarsPayment({
    userId: user.id,
    plan,
    telegramPaymentChargeId,
    payload
  });
}
