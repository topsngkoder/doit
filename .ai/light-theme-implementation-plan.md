# План реализации: light theme

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

## Трекер задач

| ID | Статус | Задача | Файлы | Зависимости | Критерий завершения |
| --- | --- | --- | --- | --- | --- |
| T01 | TODO | Проаудировать все жёстко тёмные entry points и собрать список целевых файлов | `globals.css`, `layout.tsx`, `components/ui/*`, `app/**/*` | - | Есть финальный список файлов обязательного прохода |
| T02 | TODO | Спроектировать минимальную инфраструктуру темы без режима `system` | новый theme util/provider/hook | T01 | Понятно, где хранятся `dark/light`, как читать и как применять |
| T03 | TODO | Добавить раннее применение темы до первой отрисовки | `layout.tsx` | T02 | `data-theme` и `color-scheme` выставляются до гидратации |
| T04 | TODO | Ввести семантические CSS tokens для `dark` и `light` | `globals.css` | T02 | Токены покрывают root, surfaces, text, borders, focus, overlay, statuses, shadows |
| T05 | TODO | Перевести root `html/body` на токены и убрать жёсткий dark root | `globals.css`, `layout.tsx` | T03, T04 | Нет hardcoded dark root при `light` |
| T06 | TODO | Перевести `Button` на семантические варианты `primary/secondary/ghost/destructive` | `components/ui/button.tsx` | T04 | Кнопки соответствуют обоим режимам и спецификации `light` |
| T07 | TODO | Перевести `Input` и общий стиль полей ввода | `components/ui/input.tsx`, экранные формы | T04 | Input/select/textarea используют белую базовую surface в `light` |
| T08 | TODO | Перевести `Modal`, `Dropdown`, `Popover`, `Toast` на тему и статусы | `components/ui/modal.tsx`, `dropdown.tsx`, `popover.tsx`, `toast.tsx` | T04 | Все popup/toast surface и overlay тематизируются без локальных костылей |
| T09 | TODO | Добавить UI выбора темы на страницу `Личный кабинет` | `profile/page.tsx`, новый client control при необходимости | T02, T04, T05 | Есть блок `Тема интерфейса` с 2 взаимоисключающими вариантами |
| T10 | TODO | Сделать мгновенное клиентское переключение и сохранение темы | theme util/provider + profile UI | T02, T09 | Переключение работает без reload и без submit |
| T11 | TODO | Перекрасить лендинг, вход и регистрацию по правилам `light` | `page.tsx`, `login/*`, `signup/*` | T05, T06, T07, T08 | Публичные/auth страницы корректны в обеих темах |
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
