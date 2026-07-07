import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("VALIDATION_ERROR", error.issues.map((issue) => issue.message).join("; "), 422);
  }
  if (error instanceof Error) {
    if (error.message.startsWith("TELEGRAM_AUTH") || error.message === "TELEGRAM_BOT_TOKEN_REQUIRED") {
      return jsonError(error.message, humanizeError(error.message), 401);
    }
    if (error.message === "CHAT_NOT_FOUND" || error.message === "CHARACTER_NOT_FOUND" || error.message === "USER_NOT_FOUND") {
      return jsonError(error.message, humanizeError(error.message), 404);
    }
    const status = error.message.endsWith("_REACHED") || error.message.includes("REQUIRES") ? 402 : 400;
    return jsonError(error.message, humanizeError(error.message), status);
  }
  return jsonError("INTERNAL_ERROR", "Unexpected server error.", 500);
}

function humanizeError(code: string) {
  const messages: Record<string, string> = {
    CHARACTER_LIMIT_REACHED: "Free plan allows only 3 characters. Upgrade to Plus or Pro.",
    CHAT_LIMIT_REACHED: "Free plan allows only 3 chats. Upgrade to Plus or Pro.",
    CHAT_DELETE_REQUIRES_PLUS: "Deleting or archiving chats requires Plus or Pro.",
    ADULT_MESSAGE_LIMIT_REACHED: "Free 18+ limit is over. Upgrade to Plus or Pro.",
    AGE_GATE_REQUIRED: "Confirm that you are 18+ before using adult mode.",
    LEGAL_ACCEPTANCE_REQUIRED: "Accept Terms and Privacy Policy before using adult mode.",
    ADULT_CHARACTER_AGE_REQUIRED: "All adult-mode characters must be 18+.",
    SAFETY_BLOCKED: "This request violates the safety policy.",
    TELEGRAM_AUTH_REQUIRED: "Telegram authentication is required.",
    TELEGRAM_AUTH_INVALID: "Telegram authentication is invalid.",
    TELEGRAM_AUTH_EXPIRED: "Telegram authentication has expired.",
    TELEGRAM_BOT_TOKEN_REQUIRED: "Telegram bot token is required for authentication.",
    CHAT_NOT_FOUND: "Chat not found.",
    CHARACTER_NOT_FOUND: "One or more characters do not exist.",
    USER_NOT_FOUND: "User not found."
  };
  return messages[code] ?? code;
}
