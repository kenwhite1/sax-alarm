# Маппинг скилов из 10 постов X → проект

Вы просили использовать «все скилы» из присланных ссылок. Я прочитал все 10 постов. Честный итог: часть из них — действительно скилы/практики, и они применены; часть — новости и рекламные треды, в которых применять нечего. Ниже построчно.

**@MyWestLord — «45 Claude Design Skills That Kill AI Slop»** → применено ядро: один выраженный эстетический вектор («полночный джаз-клуб» вместо фиолетового градиента), запрет Inter/Roboto (Bricolage Grotesque + IBM Plex Mono), OKLCH-палитра, сетка 4/8px, токены темы как CSS-переменные (theme-factory), motion-правила Эмиля Ковальски: микро 180мс, вход 320мс медленнее выхода 200мс, только transform/opacity, prefers-reduced-motion. Всё — в `frontend/src/theme.css`.

**@Bober_smart — «10 folders with the best skills»** → пересекается с предыдущим: frontend-design и theme-factory уже применены; systematic debugging и superpowers-подход (TDD) отражены в `backend/test/antifraud.test.ts` — тесты на границы дедупликации, а не happy-path; skill-creator и file-search — инструментальные, к коду приложения не применимы.

**@LifeOfShandi — «codexmaxxing part 2»** → применены инженерные практики: тесты определены отдельно от реализации (TDD-стиль), в DEPLOY.md — чек-лист самопроверки (QA-loop «дай агенту/себе способ проверить работу»), документация intent, а не только результата.

**@anshuc — «Building a beautiful iOS app»** → главный урок «build a loop to check its own aesthetics + sweat every detail» отражён в дизайн-проходе: состояния кнопок, haptic feedback, тайминги анимаций, empty-states с текстом, а не пустотой.

**@exploraX_ — «20 Agentic-Skills»** → применены: SCQA Writing Framework — структура README; Tone & Style Enforcer — единый голос текстов UI (ироничный, но короткий); Hook Generator — тексты пушей и онбординга («Саксофоны уже разогреваются…»); UI/UX Layout Advisor — иерархия экранов; Code Review Skill — финальный проход по связности API. Видео/крипто-скилы — вне задачи.

**@aiedge_ — «Fable 5 Prompting Masterclass»** → это гайд по промптингу модели, а не по коду; применим только принцип «объясняй почему» — он воплощён в комментариях кода, которые описывают намерение, а не пересказывают синтаксис.

**@ClaudeDevs — анонс /design-sync** → новость о продукте Claude Design; в кодовой базе применять нечего.

**@kirillk_web3 — «Fable 5 Hidden Features»** → обзор возможностей модели; к проекту не применим.

**@aiwithkhush — «10 GitHub repos that scrape»** и **@levikmunneke — «270M lead database»** → это треды про скрейпинг и лидген, к Mini App они не относятся; единственное разумное применение — заметка в MONETIZATION.md, что базу баров-партнёров для рекламных кампаний можно собирать из открытых данных Google Maps (категория, рейтинг, контакты) — тем же подходом, что описан в этих постах.
