export type Plan = "FREE" | "PLUS" | "PRO";

export type PlanLimits = {
  characters: number | "unlimited";
  chats: number | "unlimited";
  canDeleteChats: boolean;
  adultMessages: number | "unlimited";
  imageGenerationsPerDay: number;
  contextExport: "basic" | "full" | "full_with_lorebook";
  premiumModels: boolean;
  priorityQueue: boolean;
};

const freeAdultLimit = Number.parseInt(process.env.FREE_ADULT_MESSAGES_LIMIT ?? "15", 10);

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    characters: 3,
    chats: 3,
    canDeleteChats: false,
    adultMessages: Number.isFinite(freeAdultLimit) ? freeAdultLimit : 15,
    imageGenerationsPerDay: 2,
    contextExport: "basic",
    premiumModels: false,
    priorityQueue: false
  },
  PLUS: {
    characters: "unlimited",
    chats: "unlimited",
    canDeleteChats: true,
    adultMessages: "unlimited",
    imageGenerationsPerDay: 30,
    contextExport: "full",
    premiumModels: false,
    priorityQueue: false
  },
  PRO: {
    characters: "unlimited",
    chats: "unlimited",
    canDeleteChats: true,
    adultMessages: "unlimited",
    imageGenerationsPerDay: 120,
    contextExport: "full_with_lorebook",
    premiumModels: true,
    priorityQueue: true
  }
};

export function isWithinLimit(current: number, limit: number | "unlimited") {
  return limit === "unlimited" || current < limit;
}

export function assertCanCreateCharacter(plan: Plan, currentCount: number) {
  const limit = PLAN_LIMITS[plan].characters;
  if (!isWithinLimit(currentCount, limit)) {
    throw new Error("CHARACTER_LIMIT_REACHED");
  }
}

export function assertCanCreateChat(plan: Plan, currentCount: number) {
  const limit = PLAN_LIMITS[plan].chats;
  if (!isWithinLimit(currentCount, limit)) {
    throw new Error("CHAT_LIMIT_REACHED");
  }
}

export function assertCanDeleteChat(plan: Plan) {
  if (!PLAN_LIMITS[plan].canDeleteChats) {
    throw new Error("CHAT_DELETE_REQUIRES_PLUS");
  }
}

export function assertCanSendAdultMessage(plan: Plan, currentAdultCount: number) {
  const limit = PLAN_LIMITS[plan].adultMessages;
  if (!isWithinLimit(currentAdultCount, limit)) {
    throw new Error("ADULT_MESSAGE_LIMIT_REACHED");
  }
}

export function getPlanPriceStars(plan: Exclude<Plan, "FREE">) {
  const envKey = plan === "PLUS" ? "PLUS_PRICE_STARS" : "PRO_PRICE_STARS";
  const fallback = plan === "PLUS" ? 499 : 999;
  const value = Number.parseInt(process.env[envKey] ?? String(fallback), 10);
  return Number.isFinite(value) ? value : fallback;
}
