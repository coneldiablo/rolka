import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordSuccessfulTelegramStarsPayment } from "./billing-service";

const tx = {
  payment: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  subscription: {
    updateMany: vi.fn(),
    create: vi.fn()
  }
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(tx))
  }
}));

describe("billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing payment for repeated Telegram charge id", async () => {
    const existing = { id: "payment-1", providerPaymentId: "charge-1" };
    tx.payment.findFirst.mockResolvedValueOnce(existing);

    await expect(
      recordSuccessfulTelegramStarsPayment({
        userId: "user-1",
        plan: "PLUS",
        telegramPaymentChargeId: "charge-1",
        payload: { payload: "PLUS" }
      })
    ).resolves.toBe(existing);

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it("cancels previous active subscription before creating the new paid one", async () => {
    const payment = { id: "payment-2", providerPaymentId: "charge-2" };
    tx.payment.findFirst.mockResolvedValueOnce(null);
    tx.payment.create.mockResolvedValueOnce(payment);

    await expect(
      recordSuccessfulTelegramStarsPayment({
        userId: "user-1",
        plan: "PRO",
        telegramPaymentChargeId: "charge-2",
        payload: { payload: "PRO" }
      })
    ).resolves.toBe(payment);

    expect(tx.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "ACTIVE" },
        data: expect.objectContaining({ status: "CANCELED" })
      })
    );
    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", plan: "PRO", status: "ACTIVE" })
      })
    );
  });
});
