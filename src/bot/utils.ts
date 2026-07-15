import { PLAN_LIMITS } from "@/domain/plans";
import type { RpMode } from "@/domain/modes";
import type { ChatDraft, UserRuntimeProfile } from "./types";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}



export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}



export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}



export function clampTelegramText(value: string) {
  const limit = 3800;
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}\n\n[Ответ обрезан: модель написала слишком длинный пост.]`;
}



export function mapMode(mode: string): RpMode {
  const normalized = mode.toLowerCase();
  if (normalized.includes("cinematic")) return "CINEMATIC";
  if (normalized.includes("dialogue")) return "DIALOGUE_FOCUS";
  if (normalized.includes("slow")) return "SLOW_BURN";
  if (normalized.includes("adventure")) return "ADVENTURE_GM";
  if (normalized.includes("dark")) return "DARK_DRAMA";
  if (normalized.includes("18") || normalized.includes("adult")) return "ADULT";
  if (normalized.includes("photo")) return "PHOTO_SCENE";
  return "CLASSIC";
}

export function adminUserLabel(user: { telegramId: string | null; username: string | null; displayName: string | null }) {
  const name = user.username ? `@${user.username}` : user.displayName || "\u0411\u0435\u0437 \u0438\u043c\u0435\u043d\u0438";
  return `${name} \u00b7 ${user.telegramId ?? "no id"}`.slice(0, 60);
}

export function buildImportedContext(state: ChatDraft) {
  return [
    state.context ? `Старый контекст:\n${state.context}` : null,
    state.sceneBrief ? `Замысел сцены:\n${state.sceneBrief}` : null,
    state.userProfile ? `Анкета персонажа пользователя:\n${state.userProfile}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createRuntimeId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function confirmAdult(profile: UserRuntimeProfile) {
  const now = new Date();
  profile.ageVerifiedAt = now;
  profile.termsAcceptedAt = now;
  profile.privacyAcceptedAt = now;
}

export function isAdultConfirmed(profile: UserRuntimeProfile) {
  return Boolean(profile.ageVerifiedAt && profile.termsAcceptedAt && profile.privacyAcceptedAt);
}

export function freeCharacterLimit() {
  return typeof PLAN_LIMITS.FREE.characters === "number" ? PLAN_LIMITS.FREE.characters : Number.POSITIVE_INFINITY;
}

export function freeChatLimit() {
  return typeof PLAN_LIMITS.FREE.chats === "number" ? PLAN_LIMITS.FREE.chats : Number.POSITIVE_INFINITY;
}

export function freeAdultMessageLimit() {
  return typeof PLAN_LIMITS.FREE.adultMessages === "number" ? PLAN_LIMITS.FREE.adultMessages : Number.POSITIVE_INFINITY;
}
