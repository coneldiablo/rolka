import {
  Archive,
  BadgeCheck,
  BookOpen,
  Bot,
  Camera,
  Castle,
  ChevronRight,
  CircleDot,
  Coins,
  Compass,
  Copy,
  Crown,
  Flame,
  Infinity,
  LockKeyhole,
  Map,
  ScrollText,
  Shield,
  Sparkles,
  Users,
  Wand2
} from "lucide-react";

const roles = [
  {
    title: "Страж дома",
    description: "Защищает клятвы, границы владений и честь фракции в политических конфликтах.",
    icon: Shield
  },
  {
    title: "Хронист теней",
    description: "Собирает слухи, ведет досье персонажей и превращает тайны в влияние.",
    icon: ScrollText
  },
  {
    title: "Маг истока",
    description: "Изучает древние разломы, ритуалы и опасные артефакты живого мира.",
    icon: Wand2
  },
  {
    title: "Капитан дорог",
    description: "Ведет отряды через локации, караваны, экспедиции и пограничные события.",
    icon: Compass
  }
];

const worldFeatures = [
  {
    title: "Сюжетные ветки",
    description: "Каждая неделя двигает общий конфликт: союзы, предательства, открытия и последствия.",
    icon: BookOpen,
    size: "large"
  },
  {
    title: "Фракции",
    description: "Дома, ордены и вольные союзы борются за влияние.",
    icon: Crown
  },
  {
    title: "Экономика",
    description: "Ресурсы, сделки, награды и редкие предметы влияют на ход игры.",
    icon: Coins
  },
  {
    title: "Локации",
    description: "Города, руины, перевалы и закрытые зоны открываются через события.",
    icon: Map
  },
  {
    title: "Персонажи",
    description: "Анкеты проходят проверку и становятся частью общей хроники.",
    icon: Users,
    size: "wide"
  }
];

const botFeatures = [
  {
    title: "Личный кабинет",
    description: "Создавай персонажей, сохраняй анкеты отдельными кнопками и запускай новые сцены без ручной возни.",
    icon: Bot,
    stat: "Telegram + Web"
  },
  {
    title: "Контекст-спасение",
    description: "Когда чат становится длинным, кнопка собирает полный snapshot: факты, связи, текущую сцену и готовый prompt.",
    icon: Copy,
    stat: "1 click"
  },
  {
    title: "RP-режимы",
    description: "Classic, Cinematic, Dialogue Focus, Slow Burn, Adventure GM, Dark Drama и adult-only режим после проверки.",
    icon: Sparkles,
    stat: "8 modes"
  },
  {
    title: "Фото сцены",
    description: "Генерация визуала персонажа или момента из текущей переписки через подключенные AI-провайдеры.",
    icon: Camera,
    stat: "AI image"
  },
  {
    title: "Провайдеры API",
    description: "AITUNNEL как основной маршрут, OpenRouter, Gemini и DeepSeek как fallback и выбор моделей.",
    icon: Wand2,
    stat: "4 routes"
  },
  {
    title: "18+ gate",
    description: "Adult-only доступ через подтверждение возраста, Terms/Privacy и safety-фильтр незаконного контента.",
    icon: LockKeyhole,
    stat: "18+ only"
  }
];

const subscriptions = [
  {
    name: "Free",
    price: "0 Stars",
    description: "Для старта и пробы мира.",
    accent: "muted",
    features: ["3 персонажа", "3 чата", "15 сообщений 18+", "2 фото в день", "чаты нельзя удалять"]
  },
  {
    name: "Plus",
    price: "499 Stars",
    description: "Для постоянной игры без тесных лимитов.",
    accent: "rose",
    features: ["безлимит персонажей", "безлимит чатов", "удаление и архив", "полный экспорт контекста", "30 фото в день"]
  },
  {
    name: "Pro",
    price: "999 Stars",
    description: "Для больших сюжетов, дорогих моделей и длинной памяти.",
    accent: "gold",
    features: ["премиум модели", "priority queue", "long memory", "lorebook", "120 фото в день"]
  }
];

const events = [
  {
    date: "02.07",
    category: "Сюжет",
    title: "Пепельные ворота снова открылись",
    description: "На северной дороге замечены знаки старого договора. Фракции собирают разведчиков."
  },
  {
    date: "02.07",
    category: "Событие",
    title: "Ночная аудиенция в Цитадели",
    description: "Игроки могут заявить персонажей на закрытую сцену с Советом семи домов."
  },
  {
    date: "01.07",
    category: "Хроника",
    title: "Новая линия конфликтов: долг крови",
    description: "Добавлены персональные квесты для персонажей, связанных с изгнанными родами."
  }
];

const steps = [
  {
    title: "Зарегистрируйся",
    description: "Войди в кабинет, чтобы закрепить ник, настройки и доступ к игровым разделам."
  },
  {
    title: "Создай персонажа",
    description: "Заполни анкету: роль, мотивы, связи, ограничения и стартовую точку истории."
  },
  {
    title: "Пройди проверку",
    description: "Модерация сверит лор, возрастные правила и баланс персонажа."
  },
  {
    title: "Начни игру",
    description: "Выбери сцену, фракцию или событие и входи в общий сюжет."
  }
];

export default function Home() {
  const telegramBotUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? "#pricing";

  return (
    <main className="site-shell">
      <section className="hero-section" aria-label="Вход в RP-мир">
        <div className="hero-art" aria-hidden="true" />
        <header className="site-header">
          <a className="brand-lockup" href="#top" aria-label="Rolka home">
            <span className="brand-sigil">
              <Castle size={21} aria-hidden="true" />
            </span>
            <span>
              <strong>Rolka</strong>
              <small>dark fantasy RP</small>
            </span>
          </a>
          <nav className="header-nav" aria-label="Навигация">
            <a href="#roles">Роли</a>
            <a href="#bot">Бот</a>
            <a href="#world">Мир</a>
            <a href="#events">События</a>
            <a href="#pricing">Тарифы</a>
            <a href="#join">Вступить</a>
          </nav>
        </header>

        <div className="hero-content" id="top">
          <p className="kicker">
            <CircleDot size={14} aria-hidden="true" />
            Telegram RP-бот и живое сообщество
          </p>
          <h1>Войди в хроники расколотой цитадели</h1>
          <p className="hero-copy">
            Создай персонажа в кабинете, начни сцену в боте, сохраняй контекст, переключай RP-режимы и веди историю через AI.
          </p>
          <div className="hero-actions" aria-label="Основные действия">
            <a className="button primary" href="#join">
              Начать игру
              <ChevronRight size={18} aria-hidden="true" />
            </a>
            <a className="button secondary" href="/terms">
              Узнать правила
            </a>
          </div>
        </div>

        <div className="activity-strip" aria-label="Активность проекта">
          <div>
            <strong>317</strong>
            <span>игроков онлайн</span>
          </div>
          <div>
            <strong>1 842</strong>
            <span>персонажа создано</span>
          </div>
          <div>
            <strong>24k</strong>
            <span>RP-сообщений сегодня</span>
          </div>
        </div>
      </section>

      <section className="page-section" id="roles">
        <div className="section-heading">
          <span className="section-label">Choose your path</span>
          <h2>Выбери свою роль</h2>
          <p>Начни с архетипа, а дальше собери характер, связи, тайны и личный конфликт.</p>
        </div>
        <div className="role-grid">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <a className="role-card" href="#join" key={role.title}>
                <span className="card-icon">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <h3>{role.title}</h3>
                <p>{role.description}</p>
                <span className="card-link">
                  Выбрать путь
                  <ChevronRight size={16} aria-hidden="true" />
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="page-section" id="bot">
        <div className="section-heading split">
          <div>
            <span className="section-label">Bot arsenal</span>
            <h2>Все, ради чего существует Rolka</h2>
          </div>
          <p>
            Это не просто красивая RP-страница. Внутри Telegram-бот, Web-кабинет, сохраненные персонажи, AI API,
            контекст переписок и подписки.
          </p>
        </div>
        <div className="feature-grid">
          {botFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-topline">
                  <span className="card-icon small">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span>{feature.stat}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-section" id="world">
        <div className="section-heading split">
          <div>
            <span className="section-label">Living world</span>
            <h2>Живой мир</h2>
          </div>
          <p>Это не витрина с описанием игры. Это действующая хроника, где игроки двигают власть, территории и слухи.</p>
        </div>
        <div className="bento-grid">
          {worldFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className={`world-card ${feature.size ?? ""}`} key={feature.title}>
                <Icon size={24} aria-hidden="true" />
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-section" id="events">
        <div className="section-heading split">
          <div>
            <span className="section-label">Latest updates</span>
            <h2>Последние события</h2>
          </div>
          <a className="text-link" href="#join">
            Смотреть хронику
            <Archive size={17} aria-hidden="true" />
          </a>
        </div>
        <div className="event-grid">
          {events.map((event) => (
            <article className="event-card" key={event.title}>
              <div className="event-meta">
                <span>{event.date}</span>
                <span>{event.category}</span>
              </div>
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <a className="read-link" href="#join">
                Читать
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section join-section" id="join">
        <div className="section-heading">
          <span className="section-label">How to enter</span>
          <h2>Как вступить</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => (
            <article className="step-card" key={step.title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section" id="pricing">
        <div className="section-heading split">
          <div>
            <span className="section-label">Access tiers</span>
            <h2>Подписка без разрушения атмосферы</h2>
          </div>
          <p>
            Free дает попробовать мир, Plus снимает главные ограничения, Pro открывает длинную память, дорогие модели и
            приоритет для активных игроков.
          </p>
        </div>
        <div className="pricing-grid">
          {subscriptions.map((tier) => (
            <article className={`pricing-card ${tier.accent}`} key={tier.name}>
              <div className="pricing-head">
                <div>
                  <span className="section-label">{tier.name}</span>
                  <h3>{tier.price}</h3>
                </div>
                {tier.name === "Pro" ? <Infinity size={26} aria-hidden="true" /> : <Crown size={26} aria-hidden="true" />}
              </div>
              <p>{tier.description}</p>
              <ul>
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <BadgeCheck size={17} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a className={tier.name === "Free" ? "button secondary" : "button primary"} href="#join">
                {tier.name === "Free" ? "Начать бесплатно" : "Открыть доступ"}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta" aria-label="Присоединиться">
        <div>
          <span className="section-label">The gates are open</span>
          <h2>Твоя легенда еще не записана</h2>
          <p>
            Открой Telegram-бота, создай персонажа, выбери режим и начни сцену. Когда контекст закончится, Rolka поможет
            перенести память в новый чат.
          </p>
        </div>
        <a className="button primary" href={telegramBotUrl}>
          Присоединиться
          <Flame size={18} aria-hidden="true" />
        </a>
      </section>

      <footer className="site-footer">
        <span>Rolka RP Community</span>
        <div>
          <a href="/privacy">Privacy</a>
          <a href="/support">Support</a>
          <a href="/paysupport">Payments</a>
        </div>
      </footer>
    </main>
  );
}
