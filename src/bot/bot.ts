import { Bot, InlineKeyboard } from "grammy";
import type { Plan } from "@/domain/plans";
import type { RpMode } from "@/domain/modes";
import { prisma } from "@/lib/prisma";
import { recordSuccessfulTelegramStarsPaymentForTelegramUser } from "@/server/services/billing-service";
import {
  adminPanelKeyboard,
  adminUserKeyboard,
  adminUsersKeyboard,
  mainMenuKeyboard,
  onboardingStartKeyboard
} from "./keyboards";
import {
  configureRuntimeAdminTelegramIds,
  chatStates,
  getChatState,
  getUserProfile,
  loadPersistedBotSession,
  persistRuntimeSession,
  resetChatState
} from "./sessions";
import { helpText, onboardingStartText, startText } from "./texts";
import type { AdminUserListItem, TelegramFrom, UserRuntimeProfile } from "./types";
import { adminUserLabel, confirmAdult, escapeHtml } from "./utils";
import { handleCharacterAwaitingInput, registerCharactersFlow } from "./flows/characters";
import { registerPaymentsFlow } from "./flows/payments";
import { registerSavedChatsFlow } from "./flows/saved-chats";
import { handleNewChatAwaitingInput, registerNewChatFlow } from "./flows/new-chat";
import { registerActiveRpFlow } from "./flows/active-rp";

const token = process.env.TELEGRAM_BOT_TOKEN;

const configuredAdminTelegramIds = new Set(
  (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

export function createBot() {
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is unset");
  }

  configureRuntimeAdminTelegramIds(configuredAdminTelegramIds);

  const bot = new Bot(token);

  bot.catch((error) => {
    const description = String(error.error);
    if (description.includes("message is not modified") || description.includes("query is too old")) {
      return;
    }
    console.error("Telegram bot error", error.error);
  });

  bot.use(async (ctx, next) => {
    await next();
    if (!ctx.from?.id) return;
    const state = chatStates.get(ctx.from.id);
    if (!state) return;
    await persistRuntimeSession(ctx.from.id, state).catch((error) => {
      console.error("Failed to persist bot session", error);
    });
  });

  bot.command("start", async (ctx) => {
    let profile: UserRuntimeProfile | null = null;
    if (ctx.from?.id) {
      profile = getUserProfile(ctx.from.id);
      await syncTelegramUser(ctx.from);
      resetChatState(ctx.from.id);
    }
    await ctx.reply(profile?.onboardingCompleted ? "Главное меню Rolka:" : "Сначала пройди короткое обучение, оно займет около минуты.", {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.callbackQuery("start_age_accept", async (ctx) => {
    await ctx.answerCallbackQuery("Возраст подтвержден");
    if (!ctx.from?.id) return;
    const profile = getUserProfile(ctx.from.id);
    await syncTelegramUser(ctx.from);
    await confirmAdult(profile, ctx.from.id);
    resetChatState(ctx.from.id);
    await ctx.editMessageText(profile.onboardingCompleted ? startText(ctx.from.first_name) : onboardingStartText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: profile.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.command("menu", async (ctx) => {
    const profile = ctx.from?.id ? getUserProfile(ctx.from.id) : null;
    if (ctx.from?.id) await syncTelegramUser(ctx.from);
    await ctx.reply(profile?.onboardingCompleted ? "Главное меню Rolka:" : "Сначала пройди короткое обучение, оно займет около минуты.", {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.command("admin", async (ctx) => {
    if (!ctx.from?.id) return;
    await syncTelegramUser(ctx.from);
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.reply(await adminPanelText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.command("help", async (ctx) => {
    const profile = ctx.from?.id ? getUserProfile(ctx.from.id) : null;
    await ctx.reply(helpText(), {
      parse_mode: "HTML",
      reply_markup: profile?.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = null;
    const profile = getUserProfile(ctx.from.id);
    await ctx.editMessageText(profile.onboardingCompleted ? startText(ctx.from.first_name) : onboardingStartText(ctx.from.first_name), {
      parse_mode: "HTML",
      reply_markup: profile.onboardingCompleted ? mainMenuKeyboard() : onboardingStartKeyboard()
    });
  });

  bot.callbackQuery("admin_panel", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await adminPanelText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.callbackQuery("admin_stats", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await adminStatsText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  bot.callbackQuery("admin_users", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    const users = await listAdminUsers();
    await ctx.editMessageText(await adminUsersText(users), {
      parse_mode: "HTML",
      reply_markup: adminUsersKeyboard(users)
    });
  });

  bot.callbackQuery(/^admin_user:/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    const telegramId = ctx.callbackQuery.data.replace("admin_user:", "");
    await ctx.editMessageText(await adminUserText(telegramId), {
      parse_mode: "HTML",
      reply_markup: adminUserKeyboard(telegramId)
    });
  });

  bot.callbackQuery(/^admin_grant:/, async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    const [, telegramId, plan] = ctx.callbackQuery.data.split(":") as [string, string, Plan];
    await grantPlanByTelegramId(telegramId, plan);
    await ctx.answerCallbackQuery("Тариф выдан");
    await ctx.editMessageText(await adminUserText(telegramId), {
      parse_mode: "HTML",
      reply_markup: adminUserKeyboard(telegramId)
    });
  });

  bot.callbackQuery("admin_add_admin", async (ctx) => {
    if (!(await isAdminUser(ctx.from.id))) return;
    await ctx.answerCallbackQuery();
    getChatState(ctx.from.id).awaiting = "adminAddAdmin";
    await ctx.editMessageText(adminAddAdminText(), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard()
    });
  });

  registerPaymentsFlow(bot, {
    recordSuccessfulPayment,
    syncTelegramUser
  });

  registerSavedChatsFlow(bot, {
    syncTelegramUser
  });

  registerCharactersFlow(bot, {
    syncTelegramUser
  });

  registerNewChatFlow(bot, {
    syncTelegramUser
  });

  registerActiveRpFlow(bot, {
    handleAwaitingInput,
    syncTelegramUser
  });

  return bot;
}

async function syncTelegramUser(from: TelegramFrom) {
  const telegramId = String(from.id);
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `tg:${telegramId}`;
  const shouldBootstrapAdmin =
    configuredAdminTelegramIds.size === 0 && (await prisma.user.count({ where: { isAdmin: true } })) === 0;
  const shouldBeAdmin = configuredAdminTelegramIds.has(telegramId) || shouldBootstrapAdmin;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from.username,
      displayName,
      ...(shouldBeAdmin ? { isAdmin: true } : {})
    },
    create: {
      telegramId,
      username: from.username,
      displayName,
      isAdmin: shouldBeAdmin
    }
  });

  const profile = getUserProfile(from.id);
  profile.isAdmin = user.isAdmin;
  profile.plan = user.isAdmin ? "PRO" : await getActivePlan(user.id);
  profile.onboardingCompleted = user.onboardingCompleted;
  profile.onboardingMessagesShown = Boolean(user.valueCheckpointShownAt);
  profile.ageVerifiedAt = user.ageVerifiedAt ?? undefined;
  profile.termsAcceptedAt = user.termsAcceptedAt ?? undefined;
  profile.privacyAcceptedAt = user.privacyAcceptedAt ?? undefined;
  await loadPersistedProfileData(user.id, profile);
  await loadPersistedBotSession(from.id);
  return user;
}

async function isAdminUser(userId: number) {
  if (configuredAdminTelegramIds.has(String(userId))) {
    const profile = getUserProfile(userId);
    profile.isAdmin = true;
    profile.plan = "PRO";
    return true;
  }
  const user = await prisma.user.findUnique({ where: { telegramId: String(userId) }, select: { isAdmin: true } });
  if (!user?.isAdmin) return false;
  const profile = getUserProfile(userId);
  profile.isAdmin = true;
  profile.plan = "PRO";
  return true;
}

async function getActivePlan(userId: string): Promise<Plan> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
    },
    orderBy: { createdAt: "desc" }
  });
  return subscription?.plan ?? "FREE";
}

async function loadPersistedProfileData(userId: string, profile: UserRuntimeProfile) {
  const [characters, chats, chatCount, adultMessageCount] = await Promise.all([
    prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    }),
    prisma.chat.findMany({
      where: { userId, status: { not: "DELETED" } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 80 },
        characters: { include: { character: true } }
      }
    }),
    prisma.chat.count({ where: { userId, status: { not: "DELETED" }, messages: { some: {} } } }),
    prisma.chat.aggregate({ where: { userId, status: { not: "DELETED" } }, _sum: { adultMessageCount: true } })
  ]);

  profile.characters = characters.map((character) => ({
    id: character.id,
    name: character.name,
    age: character.age,
    description: character.description,
    appearance: character.appearance,
    personality: character.personality,
    speechStyle: character.speechStyle,
    setting: character.setting,
    boundaries: character.boundaries,
    starterScene: character.starterScene
  }));

  profile.savedChats = chats.map((chat) => {
    const aiCharacter = chat.characters[0]?.character;
    return {
      id: chat.id,
      title: chat.title,
      mode: chat.mode as RpMode,
      aiCharacter: aiCharacter
        ? {
            name: aiCharacter.name,
            age: aiCharacter.age,
            description: aiCharacter.description,
            appearance: aiCharacter.appearance,
            personality: aiCharacter.personality,
            speechStyle: aiCharacter.speechStyle,
            setting: aiCharacter.setting,
            boundaries: aiCharacter.boundaries,
            starterScene: aiCharacter.starterScene
          }
        : undefined,
      aiCharacterName: aiCharacter?.name ?? "Персонаж AI",
      savedAt: chat.updatedAt,
      messages: [...chat.messages].reverse().map((message) => ({
        role: message.role === "ASSISTANT" ? "assistant" : message.role === "SYSTEM" ? "system" : "user",
        content: message.content
      })),
      context: chat.importedContext ?? undefined,
      sceneBrief: chat.memorySummary ?? undefined,
      userProfile: chat.lorebook ?? undefined
    };
  });
  profile.chatsStarted = chatCount;
  profile.adultMessages = adultMessageCount._sum.adultMessageCount ?? 0;
}

async function recordSuccessfulPayment(telegramUserId: number, plan: Exclude<Plan, "FREE">, chargeId: string, payload: string) {
  await recordSuccessfulTelegramStarsPaymentForTelegramUser(telegramUserId, plan, chargeId, { payload });
}

async function grantPlanByTelegramId(telegramId: string, plan: Plan) {
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {},
    create: { telegramId, displayName: `tg:${telegramId}` }
  });
  await prisma.subscription.updateMany({
    where: { userId: user.id, status: "ACTIVE" },
    data: { status: "CANCELED", endsAt: new Date() }
  });
  if (plan !== "FREE") {
    await prisma.subscription.create({
      data: { userId: user.id, plan, status: "ACTIVE", startsAt: new Date(), endsAt: null }
    });
  }
  const numericId = Number(telegramId);
  if (Number.isFinite(numericId)) getUserProfile(numericId).plan = plan;
}

async function setAdminByTelegramId(telegramId: string) {
  await prisma.user.upsert({
    where: { telegramId },
    update: { isAdmin: true },
    create: { telegramId, displayName: `tg:${telegramId}`, isAdmin: true }
  });
  const numericId = Number(telegramId);
  if (Number.isFinite(numericId)) {
    const profile = getUserProfile(numericId);
    profile.isAdmin = true;
    profile.plan = "PRO";
  }
}

async function listAdminUsers(): Promise<AdminUserListItem[]> {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      payments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

async function adminPanelText() {
  const [users, admins, paidPayments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.payment.count({ where: { status: "PAID" } })
  ]);
  return [
    "<b>Админка Rolka</b>",
    "",
    `Участников: <b>${users}</b>`,
    `Админов: <b>${admins}</b>`,
    `Купленных подписок: <b>${paidPayments}</b>`,
    "",
    "Выбери действие кнопками ниже."
  ].join("\n");
}

async function adminStatsText() {
  const [paid, plus, pro, activeSubscriptions] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "PAID" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: "PAID", plan: "PLUS" } }),
    prisma.payment.count({ where: { status: "PAID", plan: "PRO" } }),
    prisma.subscription.count({ where: { status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } })
  ]);
  return [
    "<b>Продажи и доступы</b>",
    "",
    `Купленных подписок: <b>${paid._count._all}</b>`,
    `Plus покупок: <b>${plus}</b>`,
    `Pro покупок: <b>${pro}</b>`,
    `Сумма Stars: <b>${paid._sum.amount ?? 0}</b>`,
    `Активных доступов всего: <b>${activeSubscriptions}</b>`,
    "",
    "Админские выдачи считаются активными доступами, но не покупками."
  ].join("\n");
}

async function adminUsersText(users: AdminUserListItem[]) {
  const total = await prisma.user.count();
  const lines = users.map((user, index) => {
    const plan = user.isAdmin ? "ADMIN/PRO" : user.subscriptions[0]?.plan ?? "FREE";
    const paid = user.payments[0] ? `${user.payments[0].plan} ${user.payments[0].amount} Stars` : "нет покупок";
    return `${index + 1}. ${escapeHtml(adminUserLabel(user))}\n   План: <b>${plan}</b>, покупка: ${paid}`;
  });
  return ["<b>Участники</b>", "", `Всего: <b>${total}</b>`, "", ...lines].join("\n");
}

async function adminUserText(telegramId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 3 },
      payments: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { characters: true, chats: true, messages: true } }
    }
  });
  if (!user) return `Участник <code>${escapeHtml(telegramId)}</code> не найден. Можно выдать доступ, и он будет создан.`;
  const activePlan = user.isAdmin ? "ADMIN/PRO" : await getActivePlan(user.id);
  const payments = user.payments.length
    ? user.payments.map((payment) => `${payment.plan}: ${payment.amount} Stars`).join("\n")
    : "нет";
  return [
    "<b>Карточка участника</b>",
    "",
    `ID: <code>${escapeHtml(telegramId)}</code>`,
    `Имя: <b>${escapeHtml(user.displayName ?? "Без имени")}</b>`,
    `Username: ${user.username ? `@${escapeHtml(user.username)}` : "нет"}`,
    `Админ: <b>${user.isAdmin ? "да" : "нет"}</b>`,
    `Текущий доступ: <b>${activePlan}</b>`,
    "",
    `Персонажей: <b>${user._count.characters}</b>`,
    `Чатов: <b>${user._count.chats}</b>`,
    `Сообщений: <b>${user._count.messages}</b>`,
    "",
    "<b>Покупки:</b>",
    payments
  ].join("\n");
}

function adminAddAdminText() {
  return [
    "<b>Добавить админа</b>",
    "",
    "Отправь следующим сообщением числовой Telegram ID пользователя.",
    "",
    "Админ получает доступ к /admin и все платные возможности как Pro."
  ].join("\n");
}

async function handleAwaitingInput(
  userId: number,
  content: string,
  reply: (text: string, keyboard: InlineKeyboard) => Promise<void>
) {
  const state = getChatState(userId);
  if (state.awaiting === "adminAddAdmin") {
    state.awaiting = null;
    if (!(await isAdminUser(userId))) return true;
    const telegramId = content.trim().replace(/^@/, "");
    if (!/^\d{4,20}$/.test(telegramId)) {
      await reply("Нужен числовой Telegram ID. Например: <code>123456789</code>", adminPanelKeyboard());
      return true;
    }
    await setAdminByTelegramId(telegramId);
    await reply(`Админ добавлен: <code>${escapeHtml(telegramId)}</code>`, adminPanelKeyboard());
    return true;
  }

  if (await handleNewChatAwaitingInput(userId, content, reply)) {
    return true;
  }

  if (await handleCharacterAwaitingInput(userId, content, reply)) {
    return true;
  }

  return false;
}
