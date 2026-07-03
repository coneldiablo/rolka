import {
  Aperture,
  Clapperboard,
  Drama,
  Flame,
  Gamepad2,
  MessagesSquare,
  Moon,
  ShieldAlert
} from "lucide-react";

export type RpMode =
  | "CLASSIC"
  | "CINEMATIC"
  | "DIALOGUE_FOCUS"
  | "SLOW_BURN"
  | "ADVENTURE_GM"
  | "DARK_DRAMA"
  | "ADULT"
  | "PHOTO_SCENE";

export const RP_MODES = [
  {
    id: "CLASSIC",
    title: "Classic RP",
    description: "Balanced roleplay with actions, dialogue and steady pacing.",
    icon: MessagesSquare
  },
  {
    id: "CINEMATIC",
    title: "Cinematic",
    description: "Scene-forward prose with atmosphere, gestures and sensory detail.",
    icon: Clapperboard
  },
  {
    id: "DIALOGUE_FOCUS",
    title: "Dialogue Focus",
    description: "Shorter turns, sharper replies and less exposition.",
    icon: Drama
  },
  {
    id: "SLOW_BURN",
    title: "Slow Burn",
    description: "Gradual relationship and plot development without rushing key beats.",
    icon: Moon
  },
  {
    id: "ADVENTURE_GM",
    title: "Adventure GM",
    description: "The model runs locations, NPCs, stakes and consequences.",
    icon: Gamepad2
  },
  {
    id: "DARK_DRAMA",
    title: "Dark Drama",
    description: "Intense adult themes while staying inside safety boundaries.",
    icon: ShieldAlert
  },
  {
    id: "ADULT",
    title: "18+ Adult",
    description: "Explicit adult-only fictional roleplay after age and consent gate.",
    icon: Flame
  },
  {
    id: "PHOTO_SCENE",
    title: "Photo Scene",
    description: "Turns chat context into an image prompt for a character or scene.",
    icon: Aperture
  }
] as const satisfies ReadonlyArray<{
  id: RpMode;
  title: string;
  description: string;
  icon: typeof MessagesSquare;
}>;

export const MODE_PROMPTS: Record<RpMode, string> = {
  CLASSIC: [
    "Режим Classic RP.",
    "Используй сбалансированный темп: один читаемый пост с действиями, прямой речью, небольшим описанием обстановки и понятным местом для ответа пользователя.",
    "Не переобъясняй мотивы. Пусть настроение и намерения персонажа видны через поведение, реплики и реакцию.",
    "Сохраняй непрерывность, но не тащи старые детали в каждый ответ без необходимости."
  ].join("\n"),
  CINEMATIC: [
    "Режим Cinematic.",
    "Добавляй конкретную визуальную постановку: положение персонажей, движение, дистанцию, свет, мелкие физические действия и атмосферу.",
    "Язык при этом должен оставаться простым и естественным: без фиолетовой прозы, театральных признаний и перегруженных метафор.",
    "Фокусируйся на том, что заметила бы камера: поза, расстояние, свет, маленький выбор в движении, последствия уже совершенных действий."
  ].join("\n"),
  DIALOGUE_FOCUS: [
    "Режим Dialogue Focus.",
    "В приоритете прямая речь, паузы, подтекст и короткие физические реакции.",
    "Описание должно поддерживать разговор, а не заменять его.",
    "Делай ответы удобными для продолжения: не задавай слишком много вопросов подряд и не навязывай эмоциональные выводы."
  ].join("\n"),
  SLOW_BURN: [
    "Режим Slow Burn.",
    "Развивай доверие, напряжение, раздражение, интерес, симпатию или конфликт постепенно.",
    "Не спеши с признаниями, ревностью, possessive-поведением, резкой близостью или драматичными решениями.",
    "Значение имеют маленькие изменения: изменившийся тон, решение остаться, обозначенная граница, уход от ответа."
  ].join("\n"),
  ADVENTURE_GM: [
    "Режим Adventure GM.",
    "Веди мир вокруг персонажа пользователя: локации, NPC, риски, последствия, улики и выборы.",
    "Сохраняй агентность пользователя. Показывай ситуации и последствия уже совершенных действий, но не решай, что делает персонаж пользователя.",
    "Используй понятные ставки и практичные детали вместо эпических речей."
  ].join("\n"),
  DARK_DRAMA: [
    "Режим Dark Drama.",
    "Допускай более тяжелое настроение, секреты, давление, моральный конфликт и сложные отношения, но держи текст приземленным и естественным.",
    "Не превращай каждый ответ в травму, одержимость, контроль или отчаяние.",
    "Отказывайся от незаконного, эксплуатационного, minor-coded, принудительного контента и сексуального насилия."
  ].join("\n"),
  ADULT: [
    "Режим 18+ Adult.",
    "Adult-only вымышленный roleplay допустим только если все персонажи совершеннолетние и взаимодействие любое полный секс.",
    "Если пользователь явно начинает adult-интимность и safety-условия соблюдены, пиши естественно, конкретно и без эвфемистичных ИИ-клише, сохраняя умеренную длину постов и место для ответа пользователя.",
    "Никогда не включай несовершеннолетних, эксплуатацию, сексуальное насилие, недееспособность как способ получить сексуальный доступ, или реальные приватные интимные материалы.",
  ].join("\n"),
  PHOTO_SCENE: [
    "Режим Photo Scene.",
    "Преобразуй текущую сцену в prompt для генерации изображения.",
    "Четко опиши персонажа, обстановку, позу, кадрирование, свет, настроение, одежду и ключевые предметы.",
    "Не выдумывай крупные сюжетные факты. В prompt для изображения избегай текста, логотипов, водяных знаков и элементов интерфейса."
  ].join("\n")
};
