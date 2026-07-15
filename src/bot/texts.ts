import type { PromptCharacter } from "@/domain/prompts";
import type { RpMode } from "@/domain/modes";
import { generatedAiCharacter } from "./catalog";
import { modeButtonLabel } from "./keyboards";
import type { AwaitingInput, ChatDraft, SavedChat, UserRuntimeProfile } from "./types";
import { escapeHtml, formatDateTime } from "./utils";

export function startAgeGateText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, перед стартом нужно подтвердить возраст.</b>`,
    "",
    "Rolka поддерживает обычные RP-чаты и отдельный 18+ режим, поэтому вход в бота доступен только после подтверждения 18+.",
    "",
    "<b>Нажимая кнопку, ты подтверждаешь:</b>",
    "• тебе есть 18 лет;",
    "• ты принимаешь правила и ограничения сервиса;",
    "• несовершеннолетние персонажи, принуждение, эксплуатация и незаконный контент запрещены.",
    "",
    "Это подтверждение запрашивается один раз."
  ].join("\n");
}

export function startText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, добро пожаловать в Rolka.</b>`,
    "",
    "Здесь можно быстро начать ролку с персонажем: выбрать стиль, отправить первое сообщение и играть прямо в Telegram.",
    "",
    "Если не знаешь, с чего начать, жми <b>«Новая ролка»</b> — бот проведет по шагам.",
    "",
    "Персонажей можно придумать самому, взять сохраненного или попросить Rolka предложить вариант. Сохраненные переписки доступны в <b>«Мои ролки»</b>."
  ].join("\n");
}

export function onboardingStartText(firstName?: string) {
  return [
    `👋 <b>${escapeHtml(firstName ?? "Игрок")}, добро пожаловать в Rolka.</b>`,
    "",
    "Сейчас ты проходишь <b>короткое обучение</b>, а не смотришь весь функционал бота.",
    "",
    "За 1 минуту начнем первую ролку: выберем персонажа, стиль и отправим первое сообщение.",
    "",
    "После первой сцены откроется обычное меню Rolka со всеми режимами и функциями."
  ].join("\n");
}

export function onboardingHowText() {
  return [
    "❔ <b>Как работает обучение</b>",
    "",
    "1. Выберешь быстрый сценарий.",
    "2. Возьмешь готового персонажа или попросишь Rolka придумать его.",
    "3. Выберешь один из 3 простых стилей.",
    "4. Начнешь первую сцену.",
    "",
    "Это сделано специально: новичку не нужно сразу разбираться во всех кнопках. После обучения откроется обычный бот."
  ].join("\n");
}

export function onboardingGoalText() {
  return [
    "🎓 <b>Обучение: шаг 1 из 4</b>",
    "",
    "<b>Какую первую сцену хочешь?</b>",
    "",
    "Выбери настроение. Это не ограничение навсегда, а быстрый старт, чтобы не упереться в пустой экран."
  ].join("\n");
}

export function onboardingCharacterText() {
  return [
    "🎓 <b>Обучение: шаг 2 из 4</b>",
    "",
    "<b>Выбери персонажа для первой сцены.</b>",
    "",
    "Это готовые шаблоны для быстрого старта. Позже сможешь создавать своих персонажей и видеть все режимы."
  ].join("\n");
}

export function onboardingStyleText() {
  return [
    "🎓 <b>Обучение: шаг 3 из 4</b>",
    "",
    "<b>Выбери стиль первой ролки.</b>",
    "",
    "В обучении показываем только 3 понятных варианта. После первой сцены откроются все стили: диалоги, приключение, 18+, фото сцены и другие."
  ].join("\n");
}

export function onboardingFirstMessageText(state: ChatDraft) {
  return [
    "🎓 <b>Обучение: шаг 4 из 4</b>",
    "",
    `<b>Персонаж:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    "",
    "Теперь осталось начать сцену.",
    "",
    "Можно написать самому, например:",
    "<i>Я захожу в таверну и замечаю тебя у окна.</i>",
    "",
    "Или попроси Rolka дать стартовую сцену."
  ].join("\n");
}

export function onboardingWriteSelfText() {
  return [
    "✅ <b>Обучение почти закончено.</b>",
    "",
    "Нажми <b>«Начать чат»</b>, а затем отправь свое первое сообщение персонажу.",
    "",
    "После старта откроется обычное меню Rolka со всеми функциями."
  ].join("\n");
}

export function onboardingStarterSceneText(state: ChatDraft) {
  return [
    "✅ <b>Стартовая сцена готова.</b>",
    "",
    escapeHtml(state.context ?? generatedAiCharacter.starterScene ?? "Сцена готова к началу."),
    "",
    "Нажми <b>«Начать чат»</b>, а потом ответь персонажу любым сообщением.",
    "",
    "После старта обучение завершится и откроется обычный бот."
  ].join("\n");
}

export function helpText() {
  return [
    "<b>Как пользоваться Rolka</b>",
    "",
    "1. Нажми «Новая ролка».",
    "2. Выбери свою роль или пропусти этот шаг.",
    "3. Выбери персонажа, которым будет отвечать AI.",
    "4. Выбери стиль и отправь первое сообщение.",
    "",
    "Если продолжаешь старую переписку, выбери «Продолжить старую ролку» и вставь, что уже произошло.",
    "",
    "Free: 3 персонажа, 3 ролки, 15 сообщений в 18+ режиме.",
    "Plus/Pro дают больше ролок, длинную память, фото сцен и меньше лимитов."
  ].join("\n");
}

export function newChatText() {
  return [
    "🎭 <b>Новая ролка</b>",
    "",
    "<b>Новая ролка: шаг 1 из 5 — твоя роль.</b>",
    "",
    "Сначала выбери, кем будешь ты в сцене. Можно взять сохраненную роль, создать новую или пропустить.",
    "",
    "Персонажа, которым будет отвечать AI, выберешь на следующем шаге."
  ].join("\n");
}

export function chatContextHaveText() {
  return [
    "🧠 <b>Продолжить старую ролку</b>",
    "",
    "<b>Продолжение: шаг 1 из 5 — старый контекст.</b>",
    "",
    "Отправь одним сообщением, что уже произошло в прошлой переписке.",
    "",
    "<b>Лучше всего указать:</b>",
    "• кто с кем общается;",
    "• где сейчас сцена;",
    "• что уже случилось;",
    "• какие отношения и обещания важны;",
    "• какой тон переписки сохранить.",
    "",
    "После этого выберешь свою роль, персонажа AI, замысел сцены и стиль ролки."
  ].join("\n");
}

export function chatUserProfileText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 2 из 5 — твоя роль.</b>" : "🎭 <b>Новая ролка: шаг 1 из 5 — твоя роль.</b>";
  return [
    title,
    "",
    state?.userProfileName ? `Сейчас выбрано: <b>${escapeHtml(state.userProfileName)}</b>` : "Выбери персонажа из списка или создай нового.",
    "",
    "Это твоя роль в сцене. Персонажа, которым будет отвечать AI, выберешь отдельно."
  ].join("\n");
}

export function savedUserProfilesText() {
  return [
    "🧍 <b>Выбор твоей роли.</b>",
    "",
    "Выбери персонажа из списка или создай нового.",
    "",
    "На следующем шаге отдельно выбирается персонаж, которым будет отвечать AI."
  ].join("\n");
}

export function userProfilePickedText(name: string) {
  return [
    `✅ <b>Твоя роль выбрана:</b> ${escapeHtml(name)}`,
    "",
    "Теперь выбери персонажа, которым будет отвечать AI: сохраненного, нового или предложенного ботом."
  ].join("\n");
}

export function userProfileTemplateText() {
  return [
    "📝 <b>Шаблон твоей анкеты</b>",
    "",
    "Скопируй и заполни максимально подробно:",
    "",
    "<code>Моя роль:",
    "Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Цели в сцене:",
    "Границы/запреты:",
    "Какая динамика нужна:</code>",
    "",
    "Отправь заполненную анкету следующим сообщением. После сохранения сразу откроется выбор персонажа AI."
  ].join("\n");
}

export function chatAiCharacterText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 3 из 5 — персонаж AI.</b>" : "🤖 <b>Новая ролка: шаг 2 из 5 — персонаж AI.</b>";
  return [
    title,
    "",
    "Выбери персонажа, которым будет отвечать Rolka.",
    "",
    "Можно взять сохраненного, написать своего или попросить бота придумать персонажа под сцену."
  ].join("\n");
}

export function savedCharactersText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 3 из 5 — персонаж AI.</b>" : "🤖 <b>Новая ролка: шаг 2 из 5 — персонаж AI.</b>";
  return [
    title,
    "",
    "Выбери персонажа, которым будет отвечать AI.",
    "",
    "В меню есть сохраненные персонажи, два шаблона, создание нового персонажа и генерация."
  ].join("\n");
}

export function aiCharacterTemplateText() {
  return [
    "✍️ <b>Новый персонаж для AI</b>",
    "",
    "Напиши карточку максимально подробно:",
    "",
    "<code>Персонаж AI:",
    "Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Отношение к моему персонажу:",
    "Сеттинг/тема:",
    "Границы/запреты:",
    "Стартовая сцена:</code>",
    "",
    "Отправь карточку следующим сообщением. После сохранения сразу откроется шаг с замыслом сцены."
  ].join("\n");
}

export function aiGeneratedCharacterText(character: PromptCharacter) {
  return [
    "✨ <b>AI предложил персонажа</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(character.name)}`,
    `<b>Возраст:</b> ${character.age ?? 18}`,
    `<b>Роль:</b> ${escapeHtml(character.description)}`,
    character.personality ? `<b>Характер:</b> ${escapeHtml(character.personality)}` : "",
    character.speechStyle ? `<b>Стиль речи:</b> ${escapeHtml(character.speechStyle)}` : "",
    character.starterScene ? `<b>Старт:</b> ${escapeHtml(character.starterScene)}` : "",
    "",
    "Можно взять этого персонажа, запросить другой вариант или написать своего."
  ].filter(Boolean).join("\n");
}

export function aiCharacterPickedText(name: string) {
  return [
    `✅ <b>Персонаж AI выбран:</b> ${escapeHtml(name)}`,
    "",
    "Теперь выбери стиль ролки. После этого можно будет начать переписку."
  ].join("\n");
}

export function sceneBriefText(state: ChatDraft) {
  const characterName = state.aiCharacter?.name ?? generatedAiCharacter.name;
  const title = state.context ? "🎬 <b>Продолжение: шаг 4 из 5 — замысел сцены.</b>" : "🎬 <b>Новая ролка: шаг 3 из 5 — замысел сцены.</b>";
  return [
    title,
    "",
    `<b>Персонаж AI:</b> ${escapeHtml(characterName)}`,
    "",
    "Опиши, о чем должна быть ролка: настроение, конфликт, отношения, место или стартовую ситуацию.",
    "",
    "Можно пропустить — тогда Rolka начнет без дополнительного замысла."
  ].join("\n");
}

export function sceneBriefInputText() {
  return [
    "🎬 <b>Опиши замысел сцены</b>",
    "",
    "Отправь одним сообщением, какую ролку хочешь получить.",
    "",
    "<b>Примеры:</b>",
    "• медленное сближение после ссоры;",
    "• темная драма в закрытом городе;",
    "• приключение с выбором и последствиями;",
    "• разговор двух бывших союзников."
  ].join("\n");
}

export function sceneBriefSavedText(state: ChatDraft) {
  return [
    "✅ <b>Замысел сцены сохранен.</b>",
    "",
    state.sceneBrief ? escapeHtml(state.sceneBrief) : "Замысел не указан.",
    "",
    "Теперь выбери стиль ответа Rolka."
  ].join("\n");
}

export function chatModeStepText(state?: ChatDraft) {
  const title = state?.context ? "🧠 <b>Продолжение: шаг 5 из 5 — стиль ролки.</b>" : "🎛 <b>Новая ролка: шаг 4 из 5 — стиль ролки.</b>";
  return [
    title,
    "",
    "Выбери, как Rolka должна отвечать. Все стили доступны сразу.",
    "",
    "Если не уверен, бери <b>🎭 Обычная</b>."
  ].join("\n");
}

export function chatConfirmText(state: ChatDraft) {
  const title = state.context ? "✅ <b>Продолжение: все готово.</b>" : "✅ <b>Новая ролка: шаг 5 из 5 — все готово.</b>";
  return [
    title,
    "",
    state.userProfileName ? `<b>Твоя роль:</b> ${escapeHtml(state.userProfileName)}` : "<b>Твоя роль:</b> не указана",
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    state.context ? "<b>Старая ролка:</b> добавлена" : "<b>Старая ролка:</b> с нуля",
    state.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(state.sceneBrief)}` : "<b>Замысел:</b> не указан",
    "",
    "Нажми <b>«Начать чат»</b>, а потом просто отправь первое сообщение персонажу.",
    "",
    "Вернуться и поменять стиль или персонажа AI можно кнопками ниже."
  ].join("\n");
}

export function contextSavedText(state: ChatDraft) {
  return [
    "✅ <b>Контекст сохранен.</b>",
    "",
    `<b>Объем:</b> ${state.context?.length ?? 0} символов`,
    "",
    "Теперь выбери свою роль в сцене или пропусти этот шаг."
  ].join("\n");
}

export function userProfileSavedText(state: ChatDraft) {
  return [
    "✅ <b>Твоя анкета сохранена.</b>",
    "",
    `<b>Источник:</b> ${escapeHtml(state.userProfileName ?? "анкета вручную")}`,
    "",
    "Дальше выбери персонажа, которым будет отвечать AI."
  ].join("\n");
}

export function aiCharacterSavedText(state: ChatDraft) {
  return [
    "✅ <b>Персонаж AI сохранен.</b>",
    "",
    `<b>Персонаж:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    "",
    "Осталось выбрать режим RP и запустить чат."
  ].join("\n");
}

export function chatReadyText(state: ChatDraft, completedOnboardingNow = false) {
  return [
    "🎭 <b>Ролка началась.</b>",
    "",
    completedOnboardingNow ? "🎓 <b>Обучение завершено.</b> Теперь в главном меню открыт обычный бот со всеми функциями." : "",
    completedOnboardingNow ? "" : "",
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(state.mode ?? "CLASSIC"))}`,
    state.userProfileName ? `<b>Твоя роль:</b> ${escapeHtml(state.userProfileName)}` : "",
    `<b>Персонаж AI:</b> ${escapeHtml(state.aiCharacter?.name ?? generatedAiCharacter.name)}`,
    state.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(state.sceneBrief)}` : "",
    state.context ? "<b>Старая ролка:</b> учтена" : "<b>Старая ролка:</b> с нуля",
    "",
    "Теперь напиши первое сообщение, и персонаж ответит.",
    "",
    "Кнопки ниже: <b>Сводка сцены</b> нужна для ручного продолжения, <b>Сохранить чат</b> добавит переписку в «Мои ролки», <b>Фото сцены</b> подготовит визуал."
  ].filter(Boolean).join("\n");
}

export function valueCheckpointText() {
  return [
    "🧠 <b>Сцена уже начала складываться.</b>",
    "",
    "Rolka уже держит персонажа, настроение, отношения и текущий момент.",
    "",
    "Можно сохранить память, чтобы потом продолжить без пересказа с нуля. Free сохранит кратко, Plus откроет более полную память."
  ].join("\n");
}

export function nonAdultModeRedirectText(state: ChatDraft) {
  const characterName = state.aiCharacter?.name ?? generatedAiCharacter.name;
  return [
    `${escapeHtml(characterName)} на секунду задерживает движение, будто мягко ставит сцене границу.`,
    "",
    "— Давай не будем торопить это здесь. Останемся в напряжении, разговоре и том, что происходит между нами сейчас.",
    "",
    "Сцена может продолжиться без explicit-описаний: через флирт, паузу, эмоции, конфликт или смену обстоятельств.",
    "",
    "Если хочешь именно 18+ продолжение, выбери отдельный режим ниже."
  ].join("\n");
}

export function confirmStopChatText(state: ChatDraft) {
  return [
    "⏸ <b>Остановить ролку?</b>",
    "",
    `Сообщений в текущей памяти: <b>${state.messages.length}</b>`,
    "",
    "Чат останется в текущей сессии, но активная переписка закончится. Если хочешь потом вернуться к этой сцене через «Мои ролки», лучше нажми <b>«Сохранить чат»</b>."
  ].join("\n");
}

export function confirmSaveAndExitText(state: ChatDraft) {
  return [
    "💾 <b>Сохранить чат и выйти?</b>",
    "",
    `Сообщений будет сохранено: <b>${state.messages.length}</b>`,
    "",
    "Ролка появится в разделе <b>«Мои ролки»</b>, откуда ее можно будет продолжить."
  ].join("\n");
}

export function confirmDeleteActiveChatText(state: ChatDraft) {
  return [
    "🗑 <b>Удалить текущий чат?</b>",
    "",
    `Сообщений будет удалено из текущей сессии: <b>${state.messages.length}</b>`,
    "",
    "Это действие не сохранит ролку в <b>«Мои ролки»</b>. Если история нужна, сначала нажми <b>«Сохранить чат»</b>."
  ].join("\n");
}

export function stopText(state: ChatDraft) {
  return [
    "⏸ <b>Ролка остановлена.</b>",
    "",
    `Сообщений в памяти: <b>${state.messages.length}</b>`,
    "",
    "Можно открыть сводку сцены, начать новую ролку или сохранить текущую как чат."
  ].join("\n");
}

export function activeChatDeletedText() {
  return [
    "🗑 <b>Текущий чат удален.</b>",
    "",
    "Ролка не сохранена в «Мои ролки». Можно начать новую или продолжить старую из главного меню."
  ].join("\n");
}

export function charactersText() {
  return [
    "👤 <b>Персонажи</b>",
    "",
    "Карточка персонажа будет отправляться нейронке перед началом чата: имя, возраст, внешность, характер, стиль речи, сеттинг, границы и стартовая сцена.",
    "",
    "<b>Free:</b> можно создать 3 персонажа.",
    "<b>Plus/Pro:</b> безлимит персонажей.",
    "",
    "Нажми «Создать персонажа», отправь анкету одним сообщением, и бот сохранит ее в кнопки текущей сессии."
  ].join("\n");
}

export function characterCreateText(target: Extract<AwaitingInput, "libraryCharacter" | "chatAiCharacter" | "chatUserCharacter"> = "libraryCharacter") {
  const hint =
    target === "chatAiCharacter"
      ? "После отправки бот сохранит персонажа и сразу выберет его как персонажа AI для текущего чата."
      : target === "chatUserCharacter"
        ? "После отправки бот сохранит персонажа и сразу выберет его как твою роль в текущем чате."
        : "После отправки бот сохранит персонажа в библиотеку текущей сессии.";
  return [
    "➕ <b>Создание персонажа</b>",
    "",
    "Отправь анкету одним сообщением. Чем подробнее, тем лучше AI удержит образ.",
    "",
    hint,
    "",
    "<b>Формат:</b>",
    "<code>Имя:",
    "Возраст:",
    "Внешность:",
    "Характер:",
    "Стиль речи:",
    "Сеттинг/тема:",
    "Границы/запреты:",
    "Стартовая сцена:</code>",
    "",
    "<b>Важно:</b> для 18+ режима возраст должен быть 18+."
  ].join("\n");
}

export function characterTemplateText() {
  return [
    "➕ <b>Шаблон анкеты персонажа</b>",
    "",
    "<b>Имя:</b>",
    "<b>Возраст:</b> 18+ для adult-режима",
    "<b>Краткое описание:</b>",
    "<b>Внешность:</b>",
    "<b>Характер:</b>",
    "<b>Стиль речи:</b>",
    "<b>Сеттинг/тема:</b>",
    "<b>Границы/запреты:</b>",
    "<b>Стартовая сцена:</b>",
    "",
    "Чтобы сохранить персонажа, нажми «Создать персонажа» и отправь заполненную анкету."
  ].join("\n");
}

export function characterLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит персонажей Free исчерпан.</b>",
    "",
    `Сейчас сохранено: <b>${profile.characters.length}/3</b>.`,
    "",
    "Plus открывает безлимит персонажей, чтобы не удалять старые роли и карточки AI."
  ].join("\n");
}

export function libraryCharacterSavedText(character: PromptCharacter) {
  return [
    `✅ <b>Персонаж сохранен:</b> ${escapeHtml(character.name)}`,
    "",
    "Теперь его можно выбрать в новом чате как твою роль или как персонажа AI.",
    "",
    "<b>Важно:</b> сохранение сейчас работает в текущей Telegram-сессии процесса."
  ].join("\n");
}

export function chatsText(profile: UserRuntimeProfile) {
  if (!profile.savedChats.length) {
    return [
      "💬 <b>Мои ролки</b>",
      "",
      "Сохраненных чатов пока нет.",
      "",
      "Во время переписки нажми <b>«Сохранить чат»</b>, чтобы ролка появилась здесь."
    ].join("\n");
  }
  return [
    "💬 <b>Мои ролки</b>",
    "",
    `Сохранено чатов: <b>${profile.savedChats.length}</b>`,
    "",
    profile.savedChats.map((chat, index) => `${index + 1}. ${escapeHtml(chat.title)} · ${formatDateTime(chat.savedAt)}`).join("\n")
  ].join("\n");
}

export function deleteChatText(profile: UserRuntimeProfile) {
  if (!profile.savedChats.length) {
    return "💬 <b>Удаление чата</b>\n\nСохраненных чатов пока нет.";
  }
  return [
    "🗑 <b>Удалить чат</b>",
    "",
    "Выбери чат, который нужно удалить из сохраненных."
  ].join("\n");
}

export function savedChatText(chat?: SavedChat) {
  if (!chat) {
    return "💬 <b>Чат не найден.</b>\n\nВозможно, он уже удален.";
  }
  const lastMessages = chat.messages
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Ты" : "AI"}: ${message.content}`)
    .join("\n\n");
  return [
    `💬 <b>${escapeHtml(chat.title)}</b>`,
    "",
    `<b>Режим:</b> ${chat.mode}`,
    `<b>Персонаж AI:</b> ${escapeHtml(chat.aiCharacterName)}`,
    `<b>Сохранен:</b> ${formatDateTime(chat.savedAt)}`,
    "",
    lastMessages ? `<b>Последние сообщения:</b>\n${escapeHtml(lastMessages.slice(-2500))}` : "Сообщений в чате пока нет.",
    "",
    "Можно продолжить эту ролку, открыть сводку или удалить сохранение."
  ].join("\n");
}

export function savedChatContinueText(chat: SavedChat) {
  return [
    "▶️ <b>Ролка подготовлена к продолжению.</b>",
    "",
    `<b>Персонаж AI:</b> ${escapeHtml(chat.aiCharacterName)}`,
    `<b>Стиль:</b> ${escapeHtml(modeButtonLabel(chat.mode))}`,
    chat.sceneBrief ? `<b>Замысел:</b> ${escapeHtml(chat.sceneBrief)}` : "<b>Замысел:</b> не указан",
    "",
    "Контекст, последние сообщения и твоя роль уже добавлены. Нажми <b>«Начать чат»</b>, чтобы продолжить."
  ].join("\n");
}

export function savedChatContextText(chat?: SavedChat) {
  if (!chat) return savedChatText();
  const transcript = chat.messages
    .map((message) => `${message.role === "user" ? "Пользователь" : "AI"}: ${message.content}`)
    .join("\n\n");
  const text = [
    `🧠 <b>Сводка ролки: ${escapeHtml(chat.title)}</b>`,
    "",
    chat.context ? `<b>Импортированный контекст:</b>\n${escapeHtml(chat.context)}` : "<b>Импортированный контекст:</b> не добавлен",
    chat.sceneBrief ? `<b>Замысел сцены:</b>\n${escapeHtml(chat.sceneBrief)}` : "<b>Замысел сцены:</b> не указан",
    chat.userProfile ? `<b>Твоя роль:</b>\n${escapeHtml(chat.userProfile)}` : "<b>Твоя роль:</b> не добавлена",
    "",
    "<b>Последние сообщения:</b>",
    escapeHtml(transcript.slice(-2800))
  ].filter(Boolean).join("\n");
  return text.length > 3900 ? `${text.slice(0, 3800)}\n\n...сводка обрезана для лимита Telegram.` : text;
}

export function chatSavedAndExitedText(chat: SavedChat) {
  return [
    "💾 <b>Чат сохранен.</b>",
    "",
    `<b>Название:</b> ${escapeHtml(chat.title)}`,
    `<b>Сообщений:</b> ${chat.messages.length}`,
    "",
    "Чат остановлен и доступен в разделе <b>Мои ролки</b>. Там его можно продолжить, открыть сводку или удалить."
  ].join("\n");
}

export function contextText(state?: ChatDraft) {
  if (state?.messages.length) {
    const transcript = state.messages
      .map((message) => `${message.role === "user" ? "Пользователь" : "AI"}: ${message.content}`)
      .join("\n\n");
    const text = [
      "🧠 <b>Экспорт контекста текущего чата</b>",
      "",
      state.context ? `<b>Старый контекст:</b>\n${escapeHtml(state.context)}` : "<b>Старый контекст:</b> не добавлен",
      state.userProfile ? `<b>Анкета пользователя:</b>\n${escapeHtml(state.userProfile)}` : "<b>Анкета пользователя:</b> не добавлена",
      state.aiCharacter ? `<b>Персонаж AI:</b>\n${escapeHtml(state.aiCharacter.description)}` : "",
      "",
      "<b>Переписка:</b>",
      escapeHtml(transcript.slice(-2800))
    ]
      .filter(Boolean)
      .join("\n");
    return text.length > 3900 ? `${text.slice(0, 3800)}\n\n...контекст обрезан для лимита Telegram.` : text;
  }

  return [
    "🧠 <b>Сводка сцены</b>",
    "",
    "Если персонаж начал забывать детали, открой сводку и вставь ее при продолжении ролки:",
    "• что уже произошло;",
    "• кто с кем в каких отношениях;",
    "• важные факты;",
    "• где остановилась сцена;",
    "• стиль переписки.",
    "",
    "Потом нажми «Продолжить старую» в главном меню."
  ].join("\n");
}

export function modesText() {
  return [
    "🎛 <b>Стили ролки</b>",
    "",
    "<b>🎭 Обычная</b> — универсальная ролка.",
    "<b>🎬 Киношная</b> — больше атмосферы и деталей сцены.",
    "<b>💬 Диалоги</b> — короткие живые реплики.",
    "<b>❤️ Медленная</b> — постепенные отношения и сюжет.",
    "<b>🧭 Приключение</b> — мир, NPC, выборы и последствия.",
    "<b>🕯 Темная драма</b> — напряженные взрослые темы в рамках правил.",
    "<b>🔞 18+</b> — только после подтверждения возраста."
  ].join("\n");
}

export function modeSelectedText(mode: RpMode) {
  return `✅ <b>Стиль выбран:</b> ${escapeHtml(modeButtonLabel(mode))}\n\nТеперь можно начать ролку: этот стиль сохранится для следующего чата.`;
}

export function imageText() {
  return [
    "🖼 <b>Фото сцены</b>",
    "",
    "Rolka возьмет персонажа и текущую сцену, а потом подготовит описание для изображения.",
    "",
    "<b>Free:</b> ограниченное количество фото.",
    "<b>Plus/Pro:</b> больше фото, лучше качество и меньше ожидания."
  ].join("\n");
}

export function profileText(profile: UserRuntimeProfile) {
  const hasSubscription = profile.plan !== "FREE";
  return [
    "👤 <b>Профиль</b>",
    "",
    `<b>Дата регистрации:</b> ${formatDateTime(profile.registeredAt)}`,
    `<b>Сохраненных чатов:</b> ${profile.savedChats.length}`,
    `<b>Подписка:</b> ${hasSubscription ? profile.plan : "нет"}`,
    hasSubscription && profile.subscriptionEndsAt ? `<b>Истекает:</b> ${formatDateTime(profile.subscriptionEndsAt)}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

export function adultText() {
  return [
    "🔞 <b>18+ режим</b>",
    "",
    "Доступ только если тебе есть 18 лет и ты принимаешь Terms/Privacy.",
    "",
    "Разрешается только вымышленный adult roleplay между совершеннолетними персонажами.",
    "",
    "<b>Блокируется:</b> несовершеннолетние, принуждение, сексуальное насилие, эксплуатация, реальные интимные данные и незаконный контент.",
    "",
    "<b>Free:</b> 15 сообщений в 18+ режиме, дальше нужна Plus/Pro."
  ].join("\n");
}

export function adultAlreadyConfirmedText() {
  return [
    "🔞 <b>18+ доступ уже подтвержден.</b>",
    "",
    "Повторно подтверждать возраст не нужно.",
    "",
    "18+ режим доступен при создании нового чата. Ограничения safety остаются: все персонажи должны быть совершеннолетними, запрещены принуждение, эксплуатация, minor-coded контент, реальные интимные данные и незаконный контент."
  ].join("\n");
}

export function adultChatText() {
  return [
    "🔞 <b>18+ режим для нового чата</b>",
    "",
    "Перед стартом 18+ чата нужно подтвердить возраст и согласие с правилами.",
    "",
    "Разрешается только вымышленный adult roleplay между совершеннолетними персонажами при добровольном взаимодействии.",
    "",
    "<b>Блокируется:</b> несовершеннолетние, minor-coded персонажи, принуждение, сексуальное насилие, эксплуатация, реальные интимные данные и незаконный контент.",
    "",
    "После подтверждения бот вернет тебя не в главное меню, а на финальную проверку нового 18+ чата."
  ].join("\n");
}

export function subscriptionText() {
  return [
    "⭐ <b>Plus / Pro</b>",
    "",
    "Платный доступ нужен, чтобы не терять персонажей, ролки и полную память сцен, когда Free становится тесным.",
    "",
    "<b>Free</b>",
    "• 3 персонажа",
    "• 3 ролки",
    "• базовая память",
    "• 15 сообщений в 18+ режиме",
    "",
    "<b>Plus</b>",
    "• больше ролок и персонажей",
    "• длинная память переписки",
    "• больше 18+ сообщений без Free-упора",
    "• больше фото сцен",
    "",
    "<b>Pro</b>",
    "• лучшие модели",
    "• приоритетные ответы",
    "• максимальная память",
    "• lorebook для сложных историй",
    "• больше генераций фото"
  ].join("\n");
}

export function chatLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит ролок Free закончился.</b>",
    "",
    `Создано ролок в текущей сессии: <b>${profile.chatsStarted}/3</b>.`,
    "",
    "Plus открывает больше ролок и удобное продолжение историй без пересбора контекста с нуля."
  ].join("\n");
}

export function adultLimitText(profile: UserRuntimeProfile) {
  return [
    "⭐ <b>Лимит 18+ сообщений Free закончился.</b>",
    "",
    `Использовано: <b>${profile.adultMessages}/15</b>.`,
    "",
    "Чтобы продолжить приватную сцену в рамках правил, подключи Plus или Pro."
  ].join("\n");
}

export function rulesText() {
  return [
    "📄 <b>Правила Rolka</b>",
    "",
    "• Не используй реальные приватные данные.",
    "• Для 18+ режима все участники и персонажи должны быть 18+.",
    "• Запрещены несовершеннолетние, принуждение, эксплуатация и незаконный контент.",
    "• Уважай границы персонажа и заданные запреты.",
    "• Не пытайся обходить лимиты Free удалением чатов."
  ].join("\n");
}
