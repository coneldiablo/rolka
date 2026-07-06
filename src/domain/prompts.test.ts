import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompts";

describe("prompt pipeline", () => {
  it("combines safety, style, mode, characters, lorebook and recent messages", () => {
    const messages = buildPrompt({
      mode: "CINEMATIC",
      characters: [{ name: "Mira", age: 24, description: "A sharp private investigator." }],
      lorebook: "Neon Harbor never sleeps.",
      memorySummary: "Mira trusts the user.",
      importedContext: "Previous scene ended at the pier.",
      recentMessages: [{ role: "user", content: "Continue." }]
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Любой adult/18+ контент допустим");
    expect(messages[0].content).toContain("Никогда не используй шаблонные ИИ-фразы");
    expect(messages[0].content).toContain("Не отыгрывай действия, мысли, эмоции, реплики и решения за персонажа пользователя");
    expect(messages[0].content).toContain("Персонаж не должен постоянно подстраиваться");
    expect(messages[0].content).toContain("не решай исход за обоих");
    expect(messages[0].content).toContain("«Я здесь. Я рядом. Я никуда не уйду»");
    expect(messages[0].content).toContain("Режим: CINEMATIC");
    expect(messages[0].content).toContain("Режим Cinematic");
    expect(messages[0].content).toContain("Если текущий режим НЕ ADULT");
    expect(messages[0].content).toContain("Имя: Mira");
    expect(messages[0].content).toContain("Neon Harbor");
    expect(messages[1]).toEqual({ role: "user", content: "Continue." });
  });

  it("adds adult-only constraints in adult mode", () => {
    const messages = buildPrompt({
      mode: "ADULT",
      characters: [{ name: "Alex", age: 24, description: "Adult character." }],
      recentMessages: [{ role: "user", content: "Start." }]
    });

    expect(messages[0].content).toContain("Режим 18+ Adult");
    expect(messages[0].content).toContain("все персонажи совершеннолетние");
    expect(messages[0].content).toContain("взаимодействие добровольное");
    expect(messages[0].content).toContain("Никогда не включай несовершеннолетних");
    expect(messages[0].content).not.toContain("Если текущий режим НЕ ADULT");
  });
});
