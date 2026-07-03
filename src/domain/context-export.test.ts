import { describe, expect, it } from "vitest";
import { exportContext } from "./context-export";

describe("context export", () => {
  it("creates a full snapshot and restart prompt", () => {
    const snapshot = exportContext({
      title: "Neon Harbor",
      mode: "CLASSIC",
      characters: [{ name: "Mira", age: 24, description: "Investigator" }],
      lorebook: "Rain city.",
      memorySummary: "They found a clue.",
      messages: [
        { role: "user", content: "Open the door." },
        { role: "assistant", content: "Mira listens before touching the handle." }
      ]
    });

    expect(snapshot.fullText).toContain("USER: Open the door.");
    expect(snapshot.summary).toContain("Neon Harbor");
    expect(snapshot.facts).toContain("Rain city.");
    expect(snapshot.prompt).toContain("Continue this roleplay");
  });
});
