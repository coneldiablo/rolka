import { describe, expect, it } from "vitest";
import {
  containsAiTemplateLanguage,
  detectAdultIntentOutsideAdultMode,
  validateAdultCharacters,
  validateAdultGate,
  validateSafetyText
} from "./safety";

describe("safety", () => {
  it("requires age and legal acceptance for adult mode", () => {
    expect(validateAdultGate({}, "ADULT")).toEqual({
      ok: false,
      code: "AGE_GATE_REQUIRED",
      reason: "18+ mode requires age confirmation."
    });
    expect(
      validateAdultGate(
        { ageVerifiedAt: new Date(), termsAcceptedAt: new Date(), privacyAcceptedAt: new Date() },
        "ADULT"
      )
    ).toEqual({ ok: true });
  });

  it("requires adult characters for adult mode", () => {
    const result = validateAdultCharacters("ADULT", [{ name: "Test", age: 17, description: "A character" }]);
    expect(result.ok).toBe(false);
  });

  it("blocks prohibited safety text", () => {
    expect(validateSafetyText("forced sex scene").ok).toBe(false);
  });

  it("detects explicit adult intent outside adult mode", () => {
    expect(detectAdultIntentOutsideAdultMode("давай перейдем к сексу", "CLASSIC").ok).toBe(false);
    expect(detectAdultIntentOutsideAdultMode("давай перейдем к сексу", "ADULT").ok).toBe(true);
  });

  it("detects template AI language", () => {
    expect(containsAiTemplateLanguage("As an AI, I cannot assist with that.")).toBe(true);
    expect(containsAiTemplateLanguage("She looked over the skyline and smiled.")).toBe(false);
  });
});
