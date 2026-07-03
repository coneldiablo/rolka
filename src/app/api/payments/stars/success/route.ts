import { getPlanPriceStars, type Plan } from "@/domain/plans";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { starsSuccessSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const input = starsSuccessSchema.parse(await request.json());
    const plan = parsePayloadPlan(input.payload);
    const amount = getPlanPriceStars(plan);

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: "TELEGRAM_STARS",
        providerPaymentId: input.telegramPaymentChargeId,
        plan,
        amount,
        currency: "XTR",
        status: "PAID",
        payload: input
      }
    });

    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 1);
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan,
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt
      }
    });

    return jsonOk(payment);
  } catch (error) {
    return handleApiError(error);
  }
}

function parsePayloadPlan(payload: string): Exclude<Plan, "FREE"> {
  if (payload.includes("PRO")) return "PRO";
  return "PLUS";
}
