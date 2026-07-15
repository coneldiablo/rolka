import { loadBotSession, saveBotSession } from "@/server/services/bot-session-service";
import type { AwaitingInput, ChatDraft, UserRuntimeProfile } from "./types";

let configuredAdminTelegramIds = new Set<string>();

export function configureRuntimeAdminTelegramIds(ids: Set<string>) {
  configuredAdminTelegramIds = ids;
}

export const chatStates = new Map<number, ChatDraft>();
export const userProfiles = new Map<number, UserRuntimeProfile>();


export function getChatState(userId: number): ChatDraft {
  const existing = chatStates.get(userId);
  if (existing) return existing;
  const draft: ChatDraft = {
    awaiting: null,
    active: false,
    messages: []
  };
  chatStates.set(userId, draft);
  return draft;
}

export function resetChatState(userId: number) {
  chatStates.set(userId, {
    awaiting: null,
    active: false,
    messages: []
  });
}

export function getUserProfile(userId: number): UserRuntimeProfile {
  const existing = userProfiles.get(userId);
  if (existing) return existing;
  const isAdmin = configuredAdminTelegramIds.has(String(userId));
  const profile: UserRuntimeProfile = {
    plan: isAdmin ? "PRO" : "FREE",
    isAdmin,
    registeredAt: new Date(),
    onboardingCompleted: false,
    onboardingMessagesShown: false,
    generatedCharacterVariantIndex: 0,
    characters: [],
    savedChats: [],
    chatsStarted: 0,
    adultMessages: 0
  };
  userProfiles.set(userId, profile);
  return profile;
}

export async function loadPersistedBotSession(telegramUserId: number) {
  const session = await loadBotSession<ChatDraft>(telegramUserId);
  if (!session) return;
  chatStates.set(telegramUserId, {
    awaiting: session.draft.awaiting ?? (session.awaiting as AwaitingInput) ?? null,
    activeChatId: session.activeChatId ?? session.draft.activeChatId,
    context: session.draft.context,
    sceneBrief: session.draft.sceneBrief,
    userProfile: session.draft.userProfile,
    userProfileName: session.draft.userProfileName,
    aiCharacter: session.draft.aiCharacter,
    mode: session.draft.mode,
    active: session.draft.active,
    messages: session.draft.messages ?? []
  });
}



export async function persistRuntimeSession(telegramUserId: number, state: ChatDraft, userId?: string) {
  await saveBotSession(telegramUserId, { ...state }, {
    userId,
    awaiting: state.awaiting,
    activeChatId: state.activeChatId ?? null
  });
}


