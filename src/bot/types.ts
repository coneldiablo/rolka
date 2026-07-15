import type { Plan } from "@/domain/plans";
import type { PromptCharacter, PromptMessage } from "@/domain/prompts";
import type { RpMode } from "@/domain/modes";

export type AwaitingInput =
  | "context"
  | "sceneBrief"
  | "userProfile"
  | "aiCharacter"
  | "libraryCharacter"
  | "chatAiCharacter"
  | "chatUserCharacter"
  | "adminAddAdmin"
  | null;

export type SavedCharacter = PromptCharacter & {
  id: string;
};

export type SavedChat = {
  id: string;
  title: string;
  mode: RpMode;
  aiCharacter?: PromptCharacter;
  aiCharacterName: string;
  savedAt: Date;
  messages: PromptMessage[];
  context?: string;
  sceneBrief?: string;
  userProfile?: string;
};

export type UserRuntimeProfile = {
  plan: Plan;
  isAdmin: boolean;
  registeredAt: Date;
  subscriptionEndsAt?: Date;
  onboardingCompleted: boolean;
  onboardingMessagesShown: boolean;
  generatedCharacterVariantIndex: number;
  ageVerifiedAt?: Date;
  termsAcceptedAt?: Date;
  privacyAcceptedAt?: Date;
  characters: SavedCharacter[];
  savedChats: SavedChat[];
  chatsStarted: number;
  adultMessages: number;
};

export type ChatDraft = {
  awaiting: AwaitingInput;
  activeChatId?: string;
  context?: string;
  sceneBrief?: string;
  userProfile?: string;
  userProfileName?: string;
  aiCharacter?: PromptCharacter;
  mode?: RpMode;
  active: boolean;
  messages: PromptMessage[];
};

export type TelegramFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type AdminUserListItem = {
  telegramId: string | null;
  username: string | null;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: Date;
  subscriptions: Array<{ plan: Plan; status: string; endsAt: Date | null; createdAt: Date }>;
  payments: Array<{ amount: number; plan: Plan; status: string; createdAt: Date }>;
};
