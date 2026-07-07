import crypto from "node:crypto";

export type TelegramInitDataUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type VerifiedTelegramInitData = {
  telegramId: string;
  username?: string;
  displayName: string;
};

export function verifyTelegramInitData(initData: string, botToken: string, now = Math.floor(Date.now() / 1000)): VerifiedTelegramInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("TELEGRAM_AUTH_REQUIRED");
  params.delete("hash");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now - authDate > 86400) {
    throw new Error("TELEGRAM_AUTH_EXPIRED");
  }

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const actual = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actual)) {
    throw new Error("TELEGRAM_AUTH_INVALID");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("TELEGRAM_AUTH_REQUIRED");
  const user = JSON.parse(rawUser) as TelegramInitDataUser;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `tg:${user.id}`;
  return {
    telegramId: String(user.id),
    username: user.username,
    displayName
  };
}

export function readTelegramInitData(request: Request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("tma ")) return auth.slice(4);
  return request.headers.get("x-telegram-init-data") ?? url.searchParams.get("initData");
}
