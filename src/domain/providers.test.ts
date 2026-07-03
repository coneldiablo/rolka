import { describe, expect, it } from "vitest";
import { generateWithFallback, type TextProvider } from "./providers";

describe("provider fallback", () => {
  it("falls back to the next provider when one fails", async () => {
    const providers: TextProvider[] = [
      {
        name: "aitunnel",
        async generateText() {
          throw new Error("network");
        }
      },
      {
        name: "openrouter",
        async generateText() {
          return { content: "The scene continues.", provider: "openrouter", model: "test-model" };
        }
      }
    ];

    await expect(generateWithFallback(providers, { messages: [{ role: "user", content: "go" }] })).resolves.toEqual({
      content: "The scene continues.",
      provider: "openrouter",
      model: "test-model"
    });
  });
});
