-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PLUS', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "ChatMode" AS ENUM ('CLASSIC', 'CINEMATIC', 'DIALOGUE_FOCUS', 'SLOW_BURN', 'ADVENTURE_GM', 'DARK_DRAMA', 'ADULT', 'PHOTO_SCENE');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('TELEGRAM_STARS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ModerationSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('QUEUED', 'GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "valueCheckpointShownAt" TIMESTAMP(3),
    "ageVerifiedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'TELEGRAM_STARS',
    "providerPaymentId" TEXT,
    "plan" "Plan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XTR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "userId" TEXT,
    "awaiting" TEXT,
    "draftJson" JSONB NOT NULL,
    "activeChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "appearance" TEXT,
    "personality" TEXT,
    "speechStyle" TEXT,
    "setting" TEXT,
    "boundaries" TEXT,
    "starterScene" TEXT,
    "isAdultReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "ChatMode" NOT NULL DEFAULT 'CLASSIC',
    "status" "ChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "adultMessageCount" INTEGER NOT NULL DEFAULT 0,
    "memorySummary" TEXT,
    "lorebook" TEXT,
    "importedContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatCharacter" (
    "chatId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,

    CONSTRAINT "ChatCharacter_pkey" PRIMARY KEY ("chatId","characterId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "facts" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "severity" "ModerationSeverity" NOT NULL,
    "reason" TEXT NOT NULL,
    "input" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT,
    "prompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ImageStatus" NOT NULL DEFAULT 'QUEUED',
    "imageUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_status_endsAt_idx" ON "Subscription"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BotSession_telegramId_key" ON "BotSession"("telegramId");

-- CreateIndex
CREATE INDEX "BotSession_userId_idx" ON "BotSession"("userId");

-- CreateIndex
CREATE INDEX "BotSession_activeChatId_idx" ON "BotSession"("activeChatId");

-- CreateIndex
CREATE INDEX "Character_userId_createdAt_idx" ON "Character"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Character_userId_name_idx" ON "Character"("userId", "name");

-- CreateIndex
CREATE INDEX "Chat_userId_status_idx" ON "Chat"("userId", "status");

-- CreateIndex
CREATE INDEX "Chat_userId_status_updatedAt_idx" ON "Chat"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_key_key" ON "PromptTemplate"("key");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_type_createdAt_idx" ON "UsageEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ContextSnapshot_chatId_createdAt_idx" ON "ContextSnapshot"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationEvent_userId_severity_createdAt_idx" ON "ModerationEvent"("userId", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGeneration_userId_createdAt_idx" ON "ImageGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageGeneration_userId_status_createdAt_idx" ON "ImageGeneration"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_activeChatId_fkey" FOREIGN KEY ("activeChatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCharacter" ADD CONSTRAINT "ChatCharacter_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatCharacter" ADD CONSTRAINT "ChatCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSnapshot" ADD CONSTRAINT "ContextSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSnapshot" ADD CONSTRAINT "ContextSnapshot_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvent" ADD CONSTRAINT "ModerationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneration" ADD CONSTRAINT "ImageGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGeneration" ADD CONSTRAINT "ImageGeneration_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

