import type { Plan } from "@/domain/plans";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { starsSuccessSchema } from "@/server/schemas";
import { recordSuccessfulTelegramStarsPayment } from "@/server/services/billing-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const input = starsSuccessSchema.parse(await request.json());
    const plan = parsePayloadPlan(input.payload);

    const payment = await recordSuccessfulTelegramStarsPayment({
      userId: user.id,
      plan,
      telegramPaymentChargeId: input.telegramPaymentChargeId,
      payload: input
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
