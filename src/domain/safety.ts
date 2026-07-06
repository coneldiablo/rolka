import type { RpMode } from "./modes";

export type AgeGate = {
  ageVerifiedAt?: Date | string | null;
  termsAcceptedAt?: Date | string | null;
  privacyAcceptedAt?: Date | string | null;
};

export type CharacterSafetyInput = {
  name: string;
  age: number;
  description?: string | null;
  starterScene?: string | null;
};

export type SafetyResult =
  | { ok: true }
  | { ok: false; code: string; reason: string };

const blockedPatterns: Array<[RegExp, string]> = [
  [/\b(minor|underage|child|teen\s*under\s*18|schoolgirl|schoolboy)\b/i, "Minor-coded sexual or romantic content is not allowed."],
  [/\b(несовершеннолет|малолет|школьниц|школьник|реб[её]нок|дитя)\b/i, "Minor-coded sexual or romantic content is not allowed."],
  [/\b(rape|raped|non[-\s]?consensual|forced sex|coercion)\b/i, "Sexual violence or coercion is not allowed."],
  [/\b(изнасил|принужд|насильно|без согласия)\b/i, "Sexual violence or coercion is not allowed."],
  [/\b(real address|passport|credit card|private nude|dox)\b/i, "Real private data or non-consensual intimate material is not allowed."],
  [/\b(паспорт|карта банка|адрес проживания|слить интим)\b/i, "Real private data or non-consensual intimate material is not allowed."]
];

const adultIntentPatterns = [
  /\b(sex|sexual|explicit|nude|naked|horny|undress|strip|blowjob|handjob|orgasm|penetrat|cum|cock|dick|pussy|clit|tits)\b/i,
  /(секс|сексуальн|интим|эротик|возбуд|гол(ая|ый|ые)|раздев|снять одежду|трах|член|вагин|клитор|груд[ьи]|оргазм|конч|минет|куни|проникнов)/i
];

export function validateAdultGate(user: AgeGate, mode: RpMode): SafetyResult {
  if (mode !== "ADULT") return { ok: true };
  if (!user.ageVerifiedAt) {
    return { ok: false, code: "AGE_GATE_REQUIRED", reason: "18+ mode requires age confirmation." };
  }
  if (!user.termsAcceptedAt || !user.privacyAcceptedAt) {
    return { ok: false, code: "LEGAL_ACCEPTANCE_REQUIRED", reason: "18+ mode requires accepted Terms and Privacy Policy." };
  }
  return { ok: true };
}

export function validateAdultCharacters(mode: RpMode, characters: CharacterSafetyInput[]): SafetyResult {
  if (mode !== "ADULT") return { ok: true };
  const tooYoung = characters.find((character) => character.age < 18);
  if (tooYoung) {
    return {
      ok: false,
      code: "ADULT_CHARACTER_AGE_REQUIRED",
      reason: `Character "${tooYoung.name}" must be 18+ for adult mode.`
    };
  }
  return validateSafetyText(
    characters
      .map((character) => [character.name, character.description, character.starterScene].filter(Boolean).join("\n"))
      .join("\n\n")
  );
}

export function validateSafetyText(input: string): SafetyResult {
  for (const [pattern, reason] of blockedPatterns) {
    if (pattern.test(input)) {
      return { ok: false, code: "SAFETY_BLOCKED", reason };
    }
  }
  return { ok: true };
}

export function detectAdultIntentOutsideAdultMode(input: string, mode: RpMode): SafetyResult {
  if (mode === "ADULT") return { ok: true };
  if (adultIntentPatterns.some((pattern) => pattern.test(input))) {
    return {
      ok: false,
      code: "ADULT_MODE_REQUIRED",
      reason: "Explicit 18+ content is available only in 18+ mode."
    };
  }
  return { ok: true };
}

export function assertSafety(result: SafetyResult) {
  if (!result.ok) {
    throw new Error(result.code);
  }
}

export function containsAiTemplateLanguage(output: string) {
  const patterns = [
    /\bas an ai\b/i,
    /\bi can(?:not|'t) (?:assist|help) with that\b/i,
    /\bas a language model\b/i,
    /\bкак (?:ии|искусственный интеллект)\b/i,
    /\bя не могу помочь с этим\b/i,
    /\bкак языковая модель\b/i
  ];
  return patterns.some((pattern) => pattern.test(output));
}
