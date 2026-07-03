import type { PromptCharacter, PromptMessage } from "./prompts";
import { renderCharacterCard } from "./prompts";

export type ContextExportInput = {
  title: string;
  mode: string;
  characters: PromptCharacter[];
  lorebook?: string | null;
  memorySummary?: string | null;
  messages: PromptMessage[];
};

export function exportContext(input: ContextExportInput) {
  const fullText = input.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const characterFacts = input.characters.map(renderCharacterCard).join("\n\n");
  const summary = [
    `Chat: ${input.title}`,
    `Mode: ${input.mode}`,
    input.memorySummary ? `Memory: ${input.memorySummary}` : null,
    input.lorebook ? `Lorebook: ${input.lorebook}` : null,
    `Last message count: ${input.messages.length}`
  ]
    .filter(Boolean)
    .join("\n");

  const facts = [`Characters:\n${characterFacts}`, input.lorebook ? `Lorebook:\n${input.lorebook}` : null]
    .filter(Boolean)
    .join("\n\n");

  const prompt = [
    "Continue this roleplay from the supplied context.",
    "Preserve character voices, relationships, unresolved plot threads, and current scene state.",
    "Context summary:",
    summary,
    "Facts:",
    facts,
    "Full transcript:",
    fullText
  ].join("\n\n");

  return { fullText, summary, facts, prompt };
}
