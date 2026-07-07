import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "./auth";
import { verifyTelegramInitData } from "./telegram-auth";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn()
    }
  }
}));

function signedInitData(botToken: string, user: object, authDate: number) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "test-query",
    user: JSON.stringify(user)
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("telegram auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies signed Telegram Mini App initData", () => {
    const botToken = "123:test-token";
    const authDate = 1_800_000_000;
    const initData = signedInitData(botToken, { id: 42, username: "mira", first_name: "Mira" }, authDate);

    expect(verifyTelegramInitData(initData, botToken, authDate + 10)).toEqual({
      telegramId: "42",
      username: "mira",
      displayName: "Mira"
    });
  });

  it("rejects production API calls without Telegram auth", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(getCurrentUser(new Request("https://rolka.test/api/me"))).rejects.toThrow("TELEGRAM_AUTH_REQUIRED");
  });

  it("keeps dev fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.upsert).mockResolvedValueOnce({ id: "user-id", telegramId: "dev-user" } as never);

    await expect(getCurrentUser(new Request("https://rolka.test/api/me"))).resolves.toMatchObject({
      id: "user-id",
      telegramId: "dev-user"
    });
  });
});
