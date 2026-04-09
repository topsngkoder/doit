# План реализации: light theme

## Прогресс (журнал)
- **2026-04-09** — **T01 DONE**: зафиксирован аудит жёстко тёмных точек входа и финальный список файлов обязательного прохода (см. раздел «Результат T01» ниже). Миграции БД для этого шага не требовались.
- **2026-04-09** — **T02 DONE**: добавлены `web/src/lib/theme/*` (ключ `doit:theme`, тип `dark` | `light`, чтение/запись `localStorage`, `applyThemeToDocument` → `data-theme` + `color-scheme`), клиентские `ThemeProvider` и `useTheme`, провайдер подключён в `layout.tsx`. Миграции БД не требовались. До **T03** возможна краткая несогласованность первого кадра с выбором из `localStorage` (исправляется ранним inline-script).
- **2026-04-09** — **T03 DONE**: в `web/src/app/layout.tsx` в `<head>` добавлен синхронный inline-script: чтение `localStorage` по `THEME_STORAGE_KEY`, валидация `light`/`dark`, иначе `dark`; выставление `data-theme` и `documentElement.style.colorScheme` до гидратации. Ключ подставляется из `constants.ts` (без расхождения с клиентом). Fallback-цвета root пока прежние (жёсткий dark в layout/globals) — снимаются в **T04–T05**. Миграции БД не требовались.
- **2026-04-09** — **Hydration fix**: на `<html>` добавлен `suppressHydrationWarning` (ранний script выставляет `data-theme` и `color-scheme` до гидратации). Убраны inline `style` с `html`/`body`; у `body` классы заменены на `bg-app-page text-app-primary` (токены из T04). Пересечение с **T05** (root на токенах) частично закрыто.
- **2026-04-09** — **T04 DONE**: в `web/src/app/globals.css` введены семантические CSS variables для `:root` (dark, близко к текущему zinc/gray UI) и `html[data-theme="light"]` (значения из `.ai/light-theme-specification.md` §5–5.4). Покрыты: surfaces, text, borders, accent, focus, overlay, три тени, success/warning/danger/info, радиусы 8/12/9999px, дополнительно `--border-divider`, `--text-link` / `--text-link-hover`. `html`/`body` переведены на `var(--bg-page)` и `var(--text-primary)`; **inline-стили в `layout.tsx` по-прежнему перебивают фон/цвет body** до **T05**. Добавлен слой `@layer utilities`: `bg-app-*`, `text-app-*`, `border-app-*`, `surface-card`, `surface-muted`, `surface-elevated`, `focus-ring-app`. Миграции БД не требовались.
- **2026-04-09** — **T05 DONE**: root полностью на токенах — стили `html`/`body` (фон, цвет текста, `min-height`, `antialiased`) перенесены в `@layer base` после `@tailwind`, без жёстких цветов вне переменных. В `layout.tsx` у `body` убраны дублирующие `bg-app-page` / `text-app-primary` (остались `min-h-screen font-sans`). При `html[data-theme="light"]` фон страницы — светлый (`--bg-page` из спецификации). Миграции БД не требовались.
- **2026-04-09** — **T06 DONE**: `web/src/components/ui/button.tsx` переведён на CSS-переменные (`--accent-*`, `--danger-*`, `--text-*`, `--bg-*`, токены secondary/disabled из `globals.css`). Focus ring: `var(--focus-ring)` + offset `var(--bg-page)`; радиус `var(--radius-control)`. В `globals.css` добавлены `--accent-btn-disabled-bg`, `--button-secondary-border`, `--button-secondary-border-hover`, `--btn-secondary-bg` / `--btn-secondary-hover-bg` (в `light` secondary фон/hover по §7.1 через поверхности). Убраны утилиты `slate`/`sky`/`rose`/`white` с кнопки. Миграции БД не требовались.
- **2026-04-09** — **T07 DONE**: в `globals.css` добавлены токены полей `--field-bg`, `--field-border`, `--field-border-hover`, `--field-border-focus`, `--field-placeholder` (`:root` + `html[data-theme="light"]` по §7.2). Утилита `.field-base` для нативных `input`/`textarea`/`select` (hover/focus/disabled 60%). `web/src/components/ui/input.tsx` на тех же токенах + `shadow-sm`, радиус `--radius-control`. Все прежние длинные классы `border-slate-700 bg-slate-900…` заменены на `field-base` в board-модалках, `profile-form`, `boards/page`, `boards-default-selector`, `invite-member`, `board-column-header`, `board-members`, `board-card-preview`, `card-comments-sidebar`. Чекбокс в `boards-default-selector` (§7.3) не трогали. Миграции БД не требовались.
- **2026-04-10** — **T08 DONE**: `modal.tsx` — overlay через `var(--overlay)`, панель `.popup-panel` + `shadow-[var(--shadow-modal)]`, заголовок/тело `text-app-primary` / `text-app-secondary`. `dropdown.tsx` / `popover.tsx` — `.popup-panel` + `shadow-[var(--shadow-card)]`, пункты меню `hover:bg-app-surface-muted`, `focus-ring-app`. `toast.tsx` — классы `toast-variant-info|success|error` в `globals.css` (граница/фон/текст из `--info|success|danger-subtle-*`, радиус `--radius-surface`, тень карточки). Миграции БД не требовались.
- **2026-04-10** — **T09 DONE**: добавлен `profile-theme-section.tsx` (client): блок «Тема интерфейса» после `<header>`, до аватара/формы; два варианта «Тёмная» / «Светлая» как `role="radio"` кнопки (без toggle/select/checkbox), `useTheme` → `setTheme`. Секция в `surface-card`, токены `text-app-*`, `border-app-*`. Подключено в `profile/page.tsx`. Миграции БД не требовались.
- **2026-04-10** — **T10 DONE**: мгновенное применение и запись в `localStorage` уже в `ThemeProvider`/`setTheme`; UI профиля вызывает `setTheme` без submit и без reload. Отдельный код не потребовался.
- **2026-04-10** — **T11 DONE**: лендинг `page.tsx` — заголовок/подзаголовок на токенах (`--text-landing-subtitle` §8.1), CTA как primary/secondary кнопки через CSS-переменные акцента и secondary. `login/page.tsx`, `signup/page.tsx` — карточки форм `surface-card`, типографика `text-app-*`, ссылка «Регистрация» через `text-app-link`. `LoginForm.tsx` / `signup-form.tsx` — лейблы `text-app-secondary`, ошибки `.text-app-validation-error` (§8.2). `UserDebugClient.tsx` — muted surface и токены границ/текста. В `globals.css`: `--text-landing-subtitle`, утилиты `text-app-landing-subtitle`, `text-app-validation-error`. Миграции БД не требовались.

## Назначение
Этот документ предназначен для AI-агента, который будет внедрять требования из `.ai/light-theme-specification.md`.

Цель: добавить полноценную тему `light`, сохранить `dark` как режим по умолчанию, перевести интерфейс на единую систему семантических токенов и убрать жёстко прошитые тёмные значения из глобального каркаса, базовых UI-компонентов и экранов приложения.

## Источник требований
- Основная спецификация: `.ai/light-theme-specification.md`
- Открытых вопросов в спецификации нет.

## Что уже видно по текущему проекту
- Сейчас проект фактически жёстко привязан к тёмной теме.
- `web/src/app/globals.css` задаёт тёмные `html`, `body` и `color-scheme: dark`.
- `web/src/app/layout.tsx` дополнительно прошивает тёмный root через `style` и классы `bg-slate-950 text-slate-50`.
- В проекте пока нет theme-provider, theme-store, theme-script для first paint и единой карты токенов.
- Базовые UI-компоненты (`button`, `input`, `modal`, `dropdown`, `popover`, `toast`) содержат тёмные классы прямо внутри реализации.
- Многие страницы и board-компоненты используют прямые `slate/sky/rose/emerald/amber` utility-классы вместо семантических токенов.
- `web/tailwind.config.ts` переопределяет палитры так, что имена `slate` и `sky` не совпадают с обычной семантикой Tailwind. На названия цветов опираться нельзя.
- Пользовательские фоновые цвета доски, изображения доски, цвета меток и select-опций уже существуют и должны остаться исключениями из общей темы.

## Основной вывод для реализации
Задачу нельзя делать как точечную перекраску нескольких страниц. Нужна минимальная, но полноценная инфраструктура темы:
- единая семантическая система токенов;
- хранение выбора темы в `localStorage`;
- применение темы до первой видимой отрисовки;
- общий способ доступа к теме из клиентских компонентов;
- поэтапный рефактор UI и экранов с заменой жёстких тёмных значений на токены.

## Целевые файлы первой волны
- `web/src/app/globals.css`
- `web/src/app/layout.tsx`
- `web/tailwind.config.ts`
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/modal.tsx`
- `web/src/components/ui/dropdown.tsx`
- `web/src/components/ui/popover.tsx`
- `web/src/components/ui/toast.tsx`

## Целевые файлы экранов и продуктовых зон
- `web/src/app/page.tsx`
- `web/src/app/login/page.tsx`
- `web/src/app/login/LoginForm.tsx`
- `web/src/app/signup/page.tsx`
- `web/src/app/signup/signup-form.tsx`
- `web/src/app/profile/page.tsx`
- `web/src/app/profile/profile-form.tsx`
- `web/src/app/profile/profile-avatar.tsx`
- `web/src/app/boards/page.tsx`
- `web/src/app/boards/boards-default-selector.tsx`
- `web/src/app/notifications/page.tsx`
- `web/src/app/notifications/settings/page.tsx`
- `web/src/app/notifications/settings/notification-settings-client.tsx`

## Целевые файлы board UI и board modal зоны
- `web/src/app/boards/[boardId]/page.tsx`
- `web/src/app/boards/[boardId]/board-background-frame.tsx`
- `web/src/app/boards/[boardId]/board-columns-dnd.tsx`
- `web/src/app/boards/[boardId]/board-column-header.tsx`
- `web/src/app/boards/[boardId]/board-card-preview-button.tsx`
- `web/src/app/boards/[boardId]/create-card-modal.tsx`
- `web/src/app/boards/[boardId]/edit-card-modal.tsx`
- `web/src/app/boards/[boardId]/card-comments-sidebar.tsx`
- `web/src/app/boards/[boardId]/board-members.tsx`
- `web/src/app/boards/[boardId]/board-settings-menu.tsx`
- `web/src/app/boards/[boardId]/board-background-button.tsx`
- `web/src/app/boards/[boardId]/board-fields-button.tsx`
- `web/src/app/boards/[boardId]/board-labels-button.tsx`
- `web/src/app/boards/[boardId]/invite-member-button.tsx`
- `web/src/app/boards/[boardId]/add-board-column-button.tsx`

## Ограничения
- Не менять бизнес-логику, тексты, маршруты, брейкпоинты и layout, кроме добавления блока выбора темы на странице `Личный кабинет`.
- Не добавлять третью тему, режим `system` или серверную синхронизацию темы.
- Не ломать пользовательские фоновые цвета/изображения досок, цвета меток и select-опций.
- Не полагаться на misleading-названия цветов в Tailwind-конфиге как на продуктовый смысл.
- Если для соблюдения спецификации потребуется UX-решение, которого нет в документе, остановиться и спросить пользователя.

## Архитектурное решение

### 1. Источник истины темы
- Канонические значения темы: `"dark"` и `"light"`.
- Хранилище выбора: `localStorage`.
- Ключ хранения: завести один явный константный ключ, например `doit:theme`.

### 2. Где должна жить тема
- На root-уровне документа через `data-theme` на `html`.
- Дополнительно синхронизировать:
  - `color-scheme`;
  - при необходимости inline background/color только как fallback до загрузки CSS;
  - клиентское состояние темы для переключателя на странице профиля.

### 3. Как избежать вспышки неправильной темы
- Вставить ранний inline-script в `layout.tsx`, который до гидратации:
  - читает `localStorage`;
  - валидирует значение;
  - выставляет `data-theme`;
  - выставляет `style.colorScheme`;
  - при необходимости задаёт root fallback-цвета.
- Если значения нет, применять `dark`.
- Нельзя ждать клиентского `useEffect` для первичного применения темы.

### 4. Как задавать токены
- Предпочтительный способ: CSS custom properties в `globals.css`.
- Токены должны быть семантическими, а не цветовыми по названию.
- Минимальный слой:
  - `--bg-page`
  - `--bg-surface`
  - `--bg-surface-muted`
  - `--bg-surface-subtle`
  - `--text-primary`
  - `--text-secondary`
  - `--text-tertiary`
  - `--text-disabled`
  - `--text-on-accent`
  - `--border-default`
  - `--border-strong`
  - `--border-accent`
  - `--accent-bg`
  - `--accent-hover`
  - `--accent-active`
  - `--accent-subtle-bg`
  - `--accent-subtle-border`
  - `--accent-subtle-text`
  - `--focus-ring`
  - `--overlay`
  - `--shadow-card`
  - `--shadow-card-hover`
  - `--shadow-modal`
  - `--success-strong`
  - `--success-subtle-bg`
  - `--success-subtle-border`
  - `--success-subtle-text`
  - `--warning-strong`
  - `--warning-subtle-bg`
  - `--warning-subtle-border`
  - `--warning-subtle-text`
  - `--danger-strong`
  - `--danger-hover`
  - `--danger-subtle-bg`
  - `--danger-subtle-border`
  - `--danger-subtle-text`
  - `--info-strong`
  - `--info-subtle-bg`
  - `--info-subtle-border`
  - `--info-subtle-text`

### 5. Как использовать токены в компонентах
- Не плодить новые случайные utility-классы по месту.
- Либо:
  - ввести компактный набор reusable utility-классов в `globals.css`;
  - либо использовать `style={{ ... }}` / arbitrary values через CSS variables точечно.
- Предпочтение: общие классы для повторяющихся поверхностей и контролов, чтобы не дублировать токены по файлам.

## Детальная декомпозиция

### Фаза 1. Аудит и заморозка входных условий
- Зафиксировать все места, где тема сейчас жёстко тёмная:
  - `globals.css`
  - `layout.tsx`
  - базовые UI-компоненты
  - страницы `page`, `login`, `signup`, `profile`, `boards`, `notifications`
  - board-зона и card modal
- Через поиск по `bg-`, `text-`, `border-`, `slate-`, `sky-`, `rose-`, `emerald-`, `amber-` собрать список файлов для обязательного прохода.
- До начала правок зафиксировать, что в проекте нет существующего theme context, чтобы не конфликтовать с невидимой инфраструктурой.

### Фаза 2. Инфраструктура темы
- Добавить общий модуль с типом темы, константой ключа `localStorage`, валидатором и helper-функциями.
- Добавить клиентский provider или тонкий hook доступа к теме для UI-переключателя.
- Добавить API уровня клиента:
  - прочитать текущую тему;
  - применить тему к `document.documentElement`;
  - сохранить тему в `localStorage`;
  - переключить тему без перезагрузки.
- Убедиться, что поведение без JS не нарушает default `dark`.

### Фаза 3. Root и first paint
- Обновить `web/src/app/layout.tsx`.
- Убрать жёсткие тёмные `style`/классы root, которые конфликтуют с темой.
- Вставить ранний inline-script для доотрисовочного применения темы.
- Настроить `html`/`body` так, чтобы и `dark`, и `light` шли от токенов, а не от hardcoded colors.
- Для `dark` оставить текущее визуальное поведение максимально близким к существующему.

### Фаза 4. Семантические токены и глобальные utility
- Обновить `web/src/app/globals.css`.
- В `:root` или `[data-theme="dark"]` описать токены для тёмной темы.
- В `[data-theme="light"]` описать точные значения из спецификации для светлой темы.
- Отдельно задать:
  - `html`, `body`;
  - `color-scheme`;
  - focus ring;
  - overlay;
  - shadow tokens;
  - радиусы `8px`, `12px`, `9999px`.
- Если удобно, создать общие utility-классы наподобие:
  - surface-card
  - surface-muted
  - surface-elevated
  - text-primary/secondary/tertiary
  - border-default/strong/accent
  - field-base
  - button-primary/secondary/ghost/destructive
  - toast-info/success/error
- Нельзя смешивать светлую и тёмную семантику в названиях utility-классов.

### Фаза 5. Базовые UI-примитивы
- Перевести `button.tsx` на семантические токены.
- Перевести `input.tsx` на семантические токены.
- Проверить `textarea` и `select`-подобные контролы внутри конкретных экранов и при необходимости вынести общий стиль.
- Перевести `modal.tsx`:
  - panel background;
  - border;
  - overlay;
  - header/body text;
  - shadow.
- Перевести `dropdown.tsx` и `popover.tsx`.
- Перевести `toast.tsx` на светлые статусные подложки в `light` и текущие/эквивалентные значения в `dark`.
- После этой фазы базовые primitive-компоненты не должны содержать зашитую привязку только к dark UI.

### Фаза 6. Выбор темы на странице профиля
- Добавить новый блок `Тема интерфейса` в `web/src/app/profile/page.tsx`.
- Блок должен стоять:
  - после заголовка страницы;
  - перед блоком аватара;
  - перед формой профиля.
- Реализовать ровно два взаимоисключающих варианта:
  - `Тёмная`
  - `Светлая`
- Не использовать toggle, select или checkbox как основной UI-паттерн.
- Изменение должно применяться мгновенно, без submit и без reload.
- Состояние переключателя должно отражать фактическую тему из `localStorage`/root.

### Фаза 7. Публичные страницы и auth
- Обновить `web/src/app/page.tsx` по правилам лендинга.
- Обновить `web/src/app/login/page.tsx` и `web/src/app/signup/page.tsx`, чтобы формы выглядели белыми карточками на светлом фоне.
- Обновить `LoginForm.tsx` и `signup-form.tsx`:
  - label;
  - input;
  - validation text;
  - CTA;
  - secondary link.
- Убедиться, что при отсутствии явного выбора эти страницы остаются в `dark`.
- Убедиться, что при предыдущем выборе `light` они открываются уже в светлой теме.

### Фаза 8. Глобальный header и root shell
- Обновить header внутри `layout.tsx`.
- Для `light` обеспечить:
  - полупрозрачный белый фон;
  - нижнюю границу `#E5EAF1`;
  - текст/hover по спецификации;
  - dropdown меню досок с белой surface, границей и стандартной тенью.
- Проверить avatar chip в header на корректность в обеих темах.
- Проверить unread badge и интерактивные hover/focus state.

### Фаза 9. Профиль, доски и уведомления
- Обновить `profile-form.tsx` и `profile-avatar.tsx` под светлые surfaces, поля, toasts, destructive hover.
- Обновить `boards/page.tsx` и `boards-default-selector.tsx` под белые секции и светлые разделители.
- Обновить `notifications/page.tsx`:
  - контейнер списка;
  - непрочитанные уведомления;
  - прочитанные уведомления;
  - статусные badge;
  - ссылки и secondary actions.
- Обновить `notifications/settings/page.tsx` и `notification-settings-client.tsx`:
  - карточки;
  - табличный блок;
  - checkbox-like controls;
  - success/error banners;
  - browser notification state.

### Фаза 10. Board background и исключения
- Обновить `board-background-frame.tsx`.
- Для изображения доски заменить текущую тёмную вуаль на светлую `rgba(255, 255, 255, 0.18)` в `light`.
- Для `dark` сохранить текущую/эквивалентную тёмную модель.
- Убедиться, что пользовательский цвет фона и пользовательское изображение не заменяются темой.
- Убедиться, что логика signed URL и кеш не затронута.

### Фаза 11. Board canvas, колонки и карточки
- Обновить board-компоненты, формирующие визуальный слой доски:
  - контейнер канвы;
  - колонки;
  - заголовки колонок;
  - карточки-превью;
  - кнопка `+ Карточка`;
  - hover/focus-состояния.
- Для `light` реализовать:
  - подложку колонки `rgba(255, 255, 255, 0.88)`;
  - border/shadow по спецификации;
  - карточки с белой surface и отделением от колонки.
- Проверить, что на фоне изображения доски читаемость сохраняется.

### Фаза 12. Цветные чипы, метки и select-опции
- Найти все места, где рендерятся пользовательские метки и цветные select-опции.
- Для светлой темы перевести их на правило:
  - border = исходный пользовательский цвет;
  - background = смесь `16%` пользовательского цвета + `84%` белой поверхности;
  - text = `#0F172A`.
- Не менять сам пользовательский исходный цвет.
- Обязательно проверить:
  - превью карточек;
  - селектор меток в модалке карточки;
  - отображение select-полей;
  - каталоги меток/опций, если они есть в текущем UI.

### Фаза 13. Modal, dropdown, popover экосистема внутри board UI
- Перевести все board-специфичные popup-поверхности на токены:
  - `create-card-modal.tsx`
  - `edit-card-modal.tsx`
  - `card-comments-sidebar.tsx`
  - board settings / labels / fields / background / invite dialogs and menus
- Убедиться, что modal layout не меняется там, где это запрещено спецификацией.
- Для card modal применить отдельные правила светлой темы:
  - белая panel;
  - светлая правая колонка комментариев;
  - светлые разделители;
  - вкладки `Детали/История` по точным цветам;
  - комментарии без тёмных подложек.

### Фаза 14. Состояния доступности
- Проверить и выровнять `focus` у всех базовых интерактивных элементов:
  - button
  - input
  - checkbox/radio-like controls
  - links
  - menu items
  - card action buttons
- Привести disabled-состояния к правилу `opacity: 60%` и обычному курсору.
- Проверить hover, чтобы в `light` не возникали грязно-серые или слишком слабые состояния.
- Ручно проверить основные текстовые контрасты на белых и светло-серых поверхностях.

### Фаза 15. Финальный аудит hardcoded colors
- Вторично пройтись поиском по `slate|sky|rose|emerald|amber|bg-black|text-white|border-` и проверить, что оставшиеся значения либо:
  - относятся к `dark` как части theme tokens;
  - относятся к пользовательским исключениям;
  - относятся к не затронутой внеобъёмной логике.
- Отдельно проверить `html`, `body`, inline-style, modal overlays и board image veil.
- Если в затронутых файлах остались жёстко тёмные root/surface-значения, задача не завершена.

### Фаза 16. Проверка и стабилизация
- Проверить оба режима: `dark` и `light`.
- Проверить первый рендер с пустым `localStorage`.
- Проверить повторное открытие браузера/вкладки после выбора `light`.
- Проверить публичные страницы, профиль, доски, уведомления, board view, card modal.
- Проверить отсутствие вспышки неправильной темы.
- Проверить, что изменение темы не ломает существующий dark UI.

## Результат T01 — аудит жёстко тёмных точек входа

### Инфраструктура темы
- В `web/src` **нет** существующего theme-context / `ThemeProvider`, атрибута `data-theme` в коде, чтения темы из `localStorage` (поиск по `theme`, `ThemeProvider`, `data-theme`, `localStorage` + `theme`). Конфликтующей скрытой инфраструктуры не обнаружено.

### Корневые hardcoded значения
- `web/src/app/globals.css`: у `html` и `body` заданы `#09090b`, `#fafafa`, `color-scheme: dark` (комментарий про fallback до Tailwind сохраняет актуальность для будущей привязки к токенам).

### Tailwind
- `web/tailwind.config.ts`: палитры переопределены (`slate` → zinc, `sky` → gray). Для реализации светлой темы опираться на семантические CSS-токены, а не на смысл имён утилит `slate`/`sky`.

### Финальный список файлов обязательного прохода (38 позиций)
Путь от корня репозитория; все под `web/` кроме явно указанного.

1. `web/src/app/globals.css`
2. `web/src/app/layout.tsx`
3. `web/src/app/page.tsx`
4. `web/src/app/login/page.tsx`
5. `web/src/app/login/LoginForm.tsx`
6. `web/src/app/login/UserDebugClient.tsx`
7. `web/src/app/signup/page.tsx`
8. `web/src/app/signup/signup-form.tsx`
9. `web/src/app/profile/page.tsx`
10. `web/src/app/profile/profile-form.tsx`
11. `web/src/app/profile/profile-avatar.tsx`
12. `web/src/app/boards/page.tsx`
13. `web/src/app/boards/boards-default-selector.tsx`
14. `web/src/app/notifications/page.tsx`
15. `web/src/app/notifications/settings/page.tsx`
16. `web/src/app/notifications/settings/notification-settings-client.tsx`
17. `web/src/app/boards/[boardId]/page.tsx`
18. `web/src/app/boards/[boardId]/board-background-frame.tsx`
19. `web/src/app/boards/[boardId]/board-columns-dnd.tsx`
20. `web/src/app/boards/[boardId]/board-column-header.tsx`
21. `web/src/app/boards/[boardId]/board-card-preview-button.tsx`
22. `web/src/app/boards/[boardId]/create-card-modal.tsx`
23. `web/src/app/boards/[boardId]/edit-card-modal.tsx`
24. `web/src/app/boards/[boardId]/card-comments-sidebar.tsx`
25. `web/src/app/boards/[boardId]/board-members.tsx`
26. `web/src/app/boards/[boardId]/board-settings-menu.tsx`
27. `web/src/app/boards/[boardId]/board-background-button.tsx`
28. `web/src/app/boards/[boardId]/board-fields-button.tsx`
29. `web/src/app/boards/[boardId]/board-labels-button.tsx`
30. `web/src/app/boards/[boardId]/invite-member-button.tsx`
31. `web/src/app/boards/[boardId]/add-board-column-button.tsx`
32. `web/src/components/ui/button.tsx`
33. `web/src/components/ui/input.tsx`
34. `web/src/components/ui/modal.tsx`
35. `web/src/components/ui/dropdown.tsx`
36. `web/src/components/ui/popover.tsx`
37. `web/src/components/ui/toast.tsx`
38. `web/tailwind.config.ts` (при необходимости расширения под токены; не полагаться на имена `slate`/`sky` как на продуктовый смысл)

### Дополнительно при фазе header (T12)
- `web/src/components/doit-logo-link.tsx` — только типографика, цвет наследуется; проверить контраст/наследование после темизации header.

### Минимальная разметка без цветовых utility (по необходимости в T18)
- `web/src/app/boards/[boardId]/board-canvas.tsx` — layout-обёртка, цветовых классов нет.

### Вне обязательного прохода по перекраске
- Серверные маршруты, `lib/*` без UI (Supabase, cron, email и т.д.) — не содержат целевых `bg-`/`text-`/`border-` для темы приложения.

## Результат T02 — инфраструктура темы

| Что | Где |
| --- | --- |
| Ключ `localStorage` | `THEME_STORAGE_KEY` = `doit:theme` в `web/src/lib/theme/constants.ts` |
| Канонические значения | `Theme` = `"dark"` \| `"light"`, массив `THEMES`, без `system` |
| Валидация | `isTheme`, `normalizeTheme` (невалидное → `dark`) |
| Чтение / запись | `readThemeFromStorage`, `readResolvedTheme`, `writeThemeToStorage` в `theme.ts` |
| Применение к документу | `applyThemeToDocument`: `html[data-theme]`, `documentElement.style.colorScheme` |
| React API | `ThemeProvider`, `useTheme()` в `theme-provider.tsx` |
| Точка подключения | `RootLayout`: обёртка `<ThemeProvider>` внутри `<body>` |
| Публичный вход | `import { … } from "@/lib/theme"` через `web/src/lib/theme/index.ts` |

Поведение без сохранённого значения: `readResolvedTheme()` → `"dark"`. Смена через `setTheme` сразу пишет в `localStorage` и обновляет DOM.

## Результат T03 — раннее применение темы

| Что | Где |
| --- | --- |
| Inline-script в `<head>` | `web/src/app/layout.tsx` — `themeBeforePaintScript` через `dangerouslySetInnerHTML` |
| Ключ хранилища | Подставляется из `THEME_STORAGE_KEY` (`JSON.stringify` в IIFE), та же константа, что в `lib/theme` |
| Поведение | `localStorage.getItem` → только `light`/`dark` принимаются; иначе и при ошибке — `dark`; на `document.documentElement`: `data-theme` + `style.colorScheme` |

Визуальный фон `html`/`body` по-прежнему задаётся жёстким тёмным layout/globals до фаз **T04–T05**; атрибуты темы на корне уже корректны до React.

## Результат T04 — семантические токены

| Группа | Переменные (фрагмент) |
| --- | --- |
| Surfaces | `--bg-page`, `--bg-surface`, `--bg-surface-muted`, `--bg-surface-subtle` |
| Text | `--text-primary` … `--text-on-accent`, `--text-link`, `--text-link-hover` |
| Borders | `--border-default`, `--border-strong`, `--border-accent`, `--border-divider` |
| Accent | `--accent-bg`, `--accent-hover`, `--accent-active`, `--accent-subtle-*` |
| Chrome | `--focus-ring`, `--focus-ring-width`, `--overlay`, `--shadow-card`, `--shadow-card-hover`, `--shadow-modal` |
| Status | `--success-*`, `--warning-*`, `--danger-*`, `--info-*` |
| Radius | `--radius-control`, `--radius-surface`, `--radius-pill` |
| Utilities | `bg-app-*`, `text-app-*`, `border-app-*`, `surface-card`, `surface-muted`, `surface-elevated`, `focus-ring-app` |

`light`: значения из спецификации. `dark`: текущая тёмная база (zinc-страница, gray-акцент как в конфиге). Полная светлая картинка на экране после снятия inline root в **T05**.

## Результат T05 — root на токенах

| Что | Где |
| --- | --- |
| Фон и цвет `html`/`body` | `globals.css` → `@layer base`: только `var(--bg-page)`, `var(--text-primary)` |
| Светлая тема | Переопределение токенов на `html[data-theme="light"]` (как в T04); корень визуально светлый без отдельных hardcoded в layout |
| `layout.tsx` | У `body` нет утилит фона/текста — не дублируем root; остаётся каркас `min-h-screen font-sans` |
| Порядок слоёв | Токены объявлены до `@tailwind`; root-стили в `base` после preflight |

## Результат T06 — Button на токенах

| Что | Где |
| --- | --- |
| Варианты | `primary` / `secondary` / `ghost` / `destructive` — цвета только через `var(--…)` |
| Доп. токены | `globals.css`: `--accent-btn-disabled-bg`, `--button-secondary-border`, `--button-secondary-border-hover`, `--btn-secondary-bg`, `--btn-secondary-hover-bg` |
| Focus | `ring` от `--focus-ring` / `--focus-ring-width`, offset `--bg-page` |
| Радиус | `--radius-control` (8px) |

## Результат T07 — поля ввода на токенах

| Что | Где |
| --- | --- |
| Токены поля | `--field-bg`, `--field-border`, `--field-border-hover`, `--field-border-focus`, `--field-placeholder` |
| Общий класс | `.field-base` в `@layer utilities` (`globals.css`) |
| Компонент | `components/ui/input.tsx` — те же переменные + лёгкая тень |
| Замена дублей | Константы `inputClass` / `textareaClass` и однотипные `className` → `field-base` (+ модификаторы где нужно) |

## Результат T08 — Modal, Dropdown, Popover, Toast

| Что | Где |
| --- | --- |
| Overlay модалки | `style={{ backgroundColor: "var(--overlay)" }}` (§5.4 light/dark из токенов) |
| Панель модалки | `popup-panel` + `shadow-[var(--shadow-modal)]`, скругление `--radius-surface` |
| Dropdown / Popover | `popup-panel` + `shadow-[var(--shadow-card)]` |
| Toast-варианты | `.toast-variant-info` / `-success` / `-error` в `globals.css` |
| Общая оболочка popup | `.popup-panel` — `--bg-surface`, `--border-default`, `--radius-surface` |

## Результат T09–T10 — тема в личном кабинете

| Что | Где |
| --- | --- |
| Блок «Тема интерфейса» | `web/src/app/profile/profile-theme-section.tsx`, вставка в `profile/page.tsx` сразу после `</header>` |
| Варианты | Две кнопки с `role="radio"` / `aria-checked`, подписи «Тёмная» и «Светлая» |
| Состояние | `useTheme().theme` и `setTheme` из `@/lib/theme` |
| Поведение | Смена темы сразу, персистенция через существующий `writeThemeToStorage` + `applyThemeToDocument` |

## Результат T11 — лендинг и auth

| Что | Где |
| --- | --- |
| Лендинг §8.1 | `app/page.tsx` + `--text-landing-subtitle` / `.text-app-landing-subtitle` |
| Карточки вход/регистрация §6.3, §8.2 | `surface-card` на `login/page.tsx`, `signup/page.tsx` |
| Формы | `LoginForm.tsx`, `signup-form.tsx` — лейблы и `.text-app-validation-error` |
| Dev-блок входа | `UserDebugClient.tsx` на семантических классах |

---

## Трекер задач

| ID | Статус | Задача | Файлы | Зависимости | Критерий завершения |
| --- | --- | --- | --- | --- | --- |
| T01 | DONE | Проаудировать все жёстко тёмные entry points и собрать список целевых файлов | `globals.css`, `layout.tsx`, `components/ui/*`, `app/**/*` | - | Есть финальный список файлов обязательного прохода |
| T02 | DONE | Спроектировать минимальную инфраструктуру темы без режима `system` | `web/src/lib/theme/*`, `layout.tsx` | T01 | Понятно, где хранятся `dark/light`, как читать и как применять |
| T03 | DONE | Добавить раннее применение темы до первой отрисовки | `layout.tsx` | T02 | `data-theme` и `color-scheme` выставляются до гидратации |
| T04 | DONE | Ввести семантические CSS tokens для `dark` и `light` | `globals.css` | T02 | Токены покрывают root, surfaces, text, borders, focus, overlay, statuses, shadows |
| T05 | DONE | Перевести root `html/body` на токены и убрать жёсткий dark root | `globals.css`, `layout.tsx` | T03, T04 | Нет hardcoded dark root при `light` |
| T06 | DONE | Перевести `Button` на семантические варианты `primary/secondary/ghost/destructive` | `components/ui/button.tsx`, `globals.css` | T04 | Кнопки соответствуют обоим режимам и спецификации `light` |
| T07 | DONE | Перевести `Input` и общий стиль полей ввода | `components/ui/input.tsx`, `globals.css`, формы/модалки досок, профиль, страница досок | T04 | Input/select/textarea используют белую базовую surface в `light` |
| T08 | DONE | Перевести `Modal`, `Dropdown`, `Popover`, `Toast` на тему и статусы | `components/ui/modal.tsx`, `dropdown.tsx`, `popover.tsx`, `toast.tsx`, `globals.css` | T04 | Все popup/toast surface и overlay тематизируются без локальных костылей |
| T09 | DONE | Добавить UI выбора темы на страницу `Личный кабинет` | `profile/page.tsx`, `profile-theme-section.tsx` | T02, T04, T05 | Есть блок `Тема интерфейса` с 2 взаимоисключающими вариантами |
| T10 | DONE | Сделать мгновенное клиентское переключение и сохранение темы | `ThemeProvider` + `profile-theme-section.tsx` | T02, T09 | Переключение работает без reload и без submit |
| T11 | DONE | Перекрасить лендинг, вход и регистрацию по правилам `light` | `page.tsx`, `login/*`, `signup/*`, `globals.css` | T05, T06, T07, T08 | Публичные/auth страницы корректны в обеих темах |
| T12 | TODO | Перевести глобальный header и header dropdown | `layout.tsx` | T05, T08 | Header соответствует светлой спецификации и не ломает `dark` |
| T13 | TODO | Перевести профильные секции, аватар, form cards и destructive states | `profile/page.tsx`, `profile-form.tsx`, `profile-avatar.tsx` | T06, T07, T08, T09 | Профиль полностью читабелен в `light` |
| T14 | TODO | Перевести страницу досок и selector default board | `boards/page.tsx`, `boards-default-selector.tsx` | T06, T07, T08 | Белые section cards, светлые разделители, ссылки по спецификации |
| T15 | TODO | Перевести центр уведомлений | `notifications/page.tsx` | T06, T08 | Непрочитанные и прочитанные уведомления соответствуют спецификации |
| T16 | TODO | Перевести настройки уведомлений и checkbox-like controls | `notifications/settings/*` | T06, T07, T08 | Табличные и карточные блоки работают в обеих темах |
| T17 | TODO | Реализовать светлую вуаль над board image и сохранить пользовательские фоновые исключения | `board-background-frame.tsx` | T04, T05 | Изображение/цвет доски не ломаются, светлая вуаль есть только в `light` |
| T18 | TODO | Перевести board canvas, колонки, карточки и `+ Карточка` | board UI файлы в `[boardId]` | T06, T08, T17 | Колонки и карточки читаемы на любом фоне |
| T19 | TODO | Перевести цветные label/select chips по правилу `16% color + 84% white` | board/card/label/select related files | T18 | Цветные чипы соответствуют спецификации и не теряют пользовательский цвет |
| T20 | TODO | Перевести card modal и связанные popup-поверхности на светлый визуальный язык | `edit-card-modal.tsx`, `card-comments-sidebar.tsx`, `create-card-modal.tsx`, др. board popups | T08, T18, T19 | Card modal сохраняет layout, но полностью светлая визуально |
| T21 | TODO | Выровнять focus/hover/disabled states по всей затронутой UI-зоне | все затронутые UI и screen файлы | T06-T20 | Focus явно виден, disabled читаем, hover мягкий и заметный |
| T22 | TODO | Финально вычистить hardcoded dark values из затронутых файлов | все изменённые файлы | T05-T21 | В затронутых местах не осталось жёстких тёмных поверхностей вне исключений |
| T23 | TODO | Провести ручную регрессионную проверку `dark` и `light` на ключевых экранах | приложение целиком | T11-T22 | Обе темы работают без визуальных регрессий |
| T24 | TODO | Прогнать диагностику по изменённым файлам и исправить новые ошибки | изменённые файлы | T23 | Нет новых линтерных ошибок, связанных с темой |

## Исполняемый порядок для AI-агента
1. Выполнить `T01`.
2. До правок UI закрыть `T02-T05`, иначе будет расползание локальных решений.
3. Затем выполнить `T06-T08`, чтобы построить стабильный слой базовых примитивов.
4. После этого сделать `T09-T10`, чтобы появился реальный способ переключать тему.
5. Выполнить экранные зоны в порядке `T11-T16`.
6. Затем пройти board-specific зону `T17-T20`.
7. Завершить работой по состояниям, чисткой hardcoded values и регрессией: `T21-T24`.
8. После каждого завершённого таска обновлять статус трекера прямо в этом документе.

## Чеклист приёмки по спецификации
- [ ] В приложении доступны ровно две темы: `dark` и `light`
- [ ] Если пользователь тему не выбирал, приложение стартует в `dark`
- [ ] Выбор темы хранится локально в браузере
- [ ] Выбор темы применяется в текущей сессии мгновенно, без reload
- [ ] Блок `Тема интерфейса` находится на странице `Личный кабинет` между header страницы и блоками аватара/формы
- [ ] На первом рендере нет вспышки неправильной темы
- [ ] Для `light` выставляется `color-scheme: light`
- [ ] Для `dark` выставляется `color-scheme: dark`
- [ ] `html` и `body` не остаются жёстко тёмными при активной `light`
- [ ] Базовые кнопки, поля ввода, modal, dropdown, popover и toast работают в обеих темах
- [ ] Лендинг, вход и регистрация используют актуальную тему из браузера
- [ ] Страницы профиля, досок, уведомлений и настроек уведомлений используют светлые surfaces по спецификации
- [ ] Непрочитанные уведомления используют светлую info-подложку, а не тёмную плашку
- [ ] Пользовательские фоновые цвета и изображения доски не заменяются темой
- [ ] На board image в `light` используется светлая вуаль `rgba(255, 255, 255, 0.18)`
- [ ] Колонки и карточки на доске остаются читаемыми и визуально отделёнными
- [ ] Цветные label/select chips используют правило смешивания с белой поверхностью
- [ ] Card modal сохраняет текущий layout, но полностью переходит на светлый визуальный язык
- [ ] Focus state явно заметен на всех основных интерактивных элементах
- [ ] Disabled state остаётся читаемым и использует `60%` opacity

## Правило остановки
Остановиться и спросить пользователя, если в ходе реализации всплывёт хотя бы одно из условий:
- точное место или формат UI-блока `Тема интерфейса` нельзя определить без изменения layout сверх описанного;
- для корректной first-paint инициализации темы нужен нестандартный механизм, которого не видно в текущем `layout.tsx`;
- обнаружится скрытая тема/дизайн-система/провайдер, конфликтующий с новым решением;
- для каких-то screen/block состояний спецификация конфликтует с уже существующей отдельной обязательной спецификацией проекта;
- для пользовательских меток или select-опций невозможно однозначно вычислить требуемую смесь цветов в текущей реализации без отдельного продуктового решения.

## Ожидаемый формат финального отчёта агента
- Какие файлы изменены
- Как реализовано хранение темы и first paint
- Где введены семантические токены
- Какие экраны и компоненты покрыты
- Какие ручные сценарии проверены
- Какие остаточные риски или зоны для допроверки остались
