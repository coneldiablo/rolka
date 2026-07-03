import { describe, expect, it } from "vitest";
import {
  PLAN_LIMITS,
  assertCanCreateCharacter,
  assertCanCreateChat,
  assertCanDeleteChat,
  assertCanSendAdultMessage
} from "./plans";

describe("plan limits", () => {
  it("limits free users to three characters and chats", () => {
    expect(() => assertCanCreateCharacter("FREE", 2)).not.toThrow();
    expect(() => assertCanCreateCharacter("FREE", 3)).toThrow("CHARACTER_LIMIT_REACHED");
    expect(() => assertCanCreateChat("FREE", 2)).not.toThrow();
    expect(() => assertCanCreateChat("FREE", 3)).toThrow("CHAT_LIMIT_REACHED");
  });

  it("prevents free users from deleting chats", () => {
    expect(() => assertCanDeleteChat("FREE")).toThrow("CHAT_DELETE_REQUIRES_PLUS");
    expect(() => assertCanDeleteChat("PLUS")).not.toThrow();
  });

  it("enforces the free adult message limit", () => {
    expect(PLAN_LIMITS.FREE.adultMessages).toBe(15);
    expect(() => assertCanSendAdultMessage("FREE", 14)).not.toThrow();
    expect(() => assertCanSendAdultMessage("FREE", 15)).toThrow("ADULT_MESSAGE_LIMIT_REACHED");
    expect(() => assertCanSendAdultMessage("PRO", 1000)).not.toThrow();
  });
});
