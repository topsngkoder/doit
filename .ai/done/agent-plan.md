# План реализации “Doit” (для AI‑агента)

Основано на `.ai/specification.md`.

## 0) Входные решения (зафиксировано)
- **Frontend**: Next.js + TypeScript.
- **UI**: Tailwind CSS (без MUI/shadcn по умолчанию).
- **Backend**: Supabase (Postgres + RLS + Realtime + Storage + Edge Functions).
- **Realtime scope**: сразу всё из раздела 13.1.
- **Уведомления**: оба канала — `browser` + `email`.
- **Deeplink карточки из уведомлений**: режим “modal-only”. В MVP считаем допустимым, что ссылка ведёт на доску; открытие конкретной карточки по URL — как опциональное улучшение (через query `?card=` на странице доски, без отдельной страницы карточки).
- **Два целевых интерфейса (обязательно)**: приложение должно иметь **отдельно продуманные версии UX для мобильных телефонов и для ПК (настольных)**. Это не «одна вёрстка только с масштабированием»: на телефоне и на большом экране — **разные паттерны навигации и раскладки** там, где это нужно (экран доски, модалки карточки, shell), при **общей** кодовой базе Next.js и общих данных/RLS. Реализация: адаптивные layout-компоненты и/или брейкпоинты Tailwind (`md:` и т.д.) с явным разделением «mobile shell» vs «desktop shell»; детализация — в EPIC O.

## 1) Цели MVP (что должно работать end‑to‑end)
- Вход/регистрация (Google, email+password, reset password), автосоздание `profiles`.
- Список досок участника.
- Доска: колонки, карточки, drag&drop (колонки и карточки), сохранение порядка (`position`), модалки create/view/edit карточки.
- Роли/права на уровне доски (пресеты + кастомные роли), инвайты по email, owner‑ограничения.
- Карточка: описание, участники, ответственный (авто/ручной), метки, комментарии с ответами, пользовательские поля, история.
- Браузерные уведомления: создание/чтение в приложении + настройки типов уведомлений; правило “не уведомлять автора”.
- Email-уведомления: outbox с ретраями, шаблоны и настройки как в 10.6.
- Realtime синхронизация для сущностей из 13.1.
- **Мобильный и настольный UI**: ключевые экраны (логин, список досок, доска, модал карточки, настройки) должны быть **удобны на телефоне и на ПК** в смысле EPIC O (два целевых интерфейса).

## 2) Структура выполнения (как агенту работать)
- Двигаться **вертикальными срезами**: БД (DDL/RLS) → минимальный UI → realtime → уведомления.
- Любая мутация данных должна быть возможна **через RLS** (UI — вторично).
- При внедрении UI учитывать **оба интерфейса** (телефон + ПК): не закрывать задачу «только под широкий монитор», если экран входит в зону EPIC O или является ключевым пользовательским потоком.
- На каждый “срез” фиксировать:
  - **API‑контракты** (таблицы/вью/функции/edge endpoints)
  - **критерии готовности** (DoD)
  - **минимальный ручной тест‑скрипт**

## 3) Трекер задач (живой чеклист)
Статусы: `todo | doing | blocked | done`.

### EPIC A — Bootstrap проекта (Next.js + Tailwind + Supabase SDK)
- [x] **A1 (done)** Инициализировать Next.js (TS) + Tailwind. DoD: локально стартует, есть базовые страницы `/login`, `/boards`.
    - Реализовано вручную в папке `web`: минимальная конфигурация Next.js 15 (app router) + Tailwind, страницы `/login` и `/boards` доступны.
- [x] **A2 (done)** Подключить `@supabase/supabase-js`, env‑переменные, клиент/сервер helpers. DoD: можно прочитать `auth.getUser()` на клиенте и на сервере.
    - A2.1: добавлены зависимости `@supabase/supabase-js`, `@supabase/ssr`, заготовки helpers `src/lib/supabase/{client,server}.ts` и `.env.local.example`.
    - A2.2: на `/login` добавлен клиентский debug‑блок (`UserDebugClient`) с вызовом `supabase.auth.getUser()`, на `/boards` серверный вызов `auth.getUser()` с отображением состояния.
- [x] **A3 (done)** Базовый layout + routing guard (гости → `/login`, авторизованные → `/boards`). DoD: редиректы корректны.
    - A3.1 (done): на `/boards` добавлен серверный guard, который редиректит неавторизованных пользователей на `/login` через `redirect("/login")`.
    - A3.2 (done): в `RootLayout` добавлен общий header с навигацией (`/`, `/login`, `/boards`) и footer; основные страницы рендерятся внутри `<main>`.
    - A3.3 (done): на `/login` и `/` добавлен серверный guard: авторизованные пользователи автоматически редиректятся на `/boards`.
    - A3.4 (done): редиректы продублированы в `web/src/middleware.ts` (edge), чтобы уходить на нужную страницу **до** рендера server component и не видеть в dev-overlay “Server Error: NEXT_REDIRECT” от механизма `redirect()`.
- [x] **A4 (done)** Общие компоненты UI на Tailwind (Button/Input/Modal/Popover/Dropdown/Toast). DoD: используются в 2+ местах.

### EPIC B — Supabase: схема данных + ограничения + индексы
- [x] **B1 (done)** Подготовить SQL миграции для всех таблиц раздела 11 (profiles…board_card_preview_items). DoD: миграция применяется без ошибок.
    - Файл `supabase/migrations/20250316100000_initial_schema.sql`: созданы таблицы profiles, boards, board_roles, board_role_permissions, board_members, board_invites (частичный unique pending), board_columns, cards, card_assignees, labels, card_labels, card_comments (+ триггер reply_same_card), board_field_definitions, board_field_select_options, card_field_values, card_activity, telegram_link_tokens, notification_outbox, notification_preferences, notification_user_settings, internal_notifications, board_card_preview_items (частичные unique). Проверка: `supabase init` (если ещё не сделано), затем `supabase db reset` или применение миграции в дашборде Supabase.
- [x] **B2 (done)** Enum/constraints: column_type, background_type, invite status, outbox status, notification types/channels и т.п. DoD: ограничения соответствуют спецификации.
    - В `supabase/migrations/20250316100000_initial_schema.sql` усилены ограничения схемы: зафиксирован whitelist для `board_role_permissions.permission`, `notification_* .event_type`; добавлены проверки для `board_invites.status` ↔ `accepted_user_id`, hex-цветов (`boards.background_color`, `labels.color`, `board_field_select_options.color`), диапазона `notification_outbox.attempts`, quiet hours и непустой timezone, а также запрет отключать preview item `title`.
    - Проверка: выполнить `supabase db reset`, затем точечно проверить, что некорректные insert/update (например, невалидный `event_type`, цвет не в формате `#RRGGBB`, `accepted` без `accepted_user_id`) падают по constraint.
    - Статус локальной проверки: заблокирована окружением на Windows без запущенного Docker Desktop (`supabase db reset` не стартует локальный Supabase stack).
    - Статус удалённой проверки: первоначально `supabase db push` падал на `CREATE TABLE public.profiles`, потому что таблица уже существовала, а в `supabase migration list` remote-история миграций была пустой. После явного подтверждения пользователя выполнен `supabase migration repair --status applied 20250316100000`; затем `supabase db push` вернул `Remote database is up to date`, а `supabase migration list` показал совпадение local/remote для `20250316100000`.
- [x] **B3 (done)** Индексы/уникальности (включая частичный unique pending invite). DoD: индексы созданы, explain на ключевых запросах не деградирует.
    - Добавлена отдельная миграция `supabase/migrations/20260317110000_add_query_indexes.sql` с индексами под ключевые сценарии MVP: список досок пользователя (`board_members.user_id, board_id`), pending-инвайты по email (`board_invites(lower(email)) where status='pending'`), загрузка колонок/карточек/меток/preview по `position`, комментарии карточки без soft-deleted, история карточки, pending outbox по `next_attempt_at`, центр уведомлений пользователя, активные Telegram link tokens.
    - Миграция применена в удалённую БД через `supabase db push` без ошибок.
    - Проверка: в Supabase SQL Editor прогнать `EXPLAIN (ANALYZE, BUFFERS)` на запросах списка досок, загрузки колонок/карточек доски, комментариев карточки и выборки pending outbox; ожидание — planner использует добавленные indexes/bitmap index scans вместо full sequential scan на рабочих фильтрах.
- [x] **B4 (done)** Триггеры `updated_at` (общая функция). DoD: `updated_at` обновляется на UPDATE.
    - Добавлена миграция `supabase/migrations/20260317120000_add_updated_at_triggers.sql` с общей функцией `public.set_updated_at()` и `BEFORE UPDATE` trigger-ами для всех текущих mutable-таблиц, где в схеме уже есть колонка `updated_at`: `profiles`, `boards`, `board_invites`, `board_columns`, `cards`, `card_comments`, `board_field_definitions`, `card_field_values`, `notification_outbox`, `notification_preferences`, `notification_user_settings`, `board_card_preview_items`.
    - Проверка: применить миграцию (`supabase db push` или `supabase db reset`), затем в SQL Editor сделать `select updated_at from ...`, выполнить `update`, и убедиться, что `updated_at` стал новее `created_at`/предыдущего значения.
- [x] **B5 (done)** Автосоздание профиля при первом входе (trigger на `auth.users` или edge hook — выбрать подход для Supabase). DoD: после логина есть `profiles` запись.
    - Выбран подход через `AFTER INSERT` trigger на `auth.users`, чтобы автосоздание `profiles` не зависело от текущего UI/flow логина и одинаково работало для email/password и OAuth.
    - Добавлена миграция `supabase/migrations/20260317123000_auto_create_profiles_on_auth_signup.sql`: функция `public.handle_new_auth_user()` создаёт/синхронизирует `profiles` по `auth.users`, заполняет `email`, `display_name` (из `display_name/full_name/name/user_name`, иначе local-part email) и `avatar_url` (из `avatar_url/picture`).
    - Проверка: применить миграцию, затем зарегистрировать нового пользователя через Supabase Auth (или OAuth login), после чего убедиться, что в `public.profiles` появилась запись с тем же `user_id`; для smoke-проверки достаточно `select * from public.profiles where user_id = '<auth_user_id>';`.

### EPIC C — Авторизация: роли/permissions + RLS
- [x] **C1 (done)** Определить в БД источник прав: `board_roles` + `board_role_permissions` + `board_members`. DoD: можно вычислить permission для (user, board).
    - Источник роли: `board_members.board_role_id` (role board-scoped через `board_roles.board_id`).
    - Источник флагов прав: `board_role_permissions` (строки permission→allowed для конкретной роли; отсутствие строки = `false`).
    - Алгоритм вычисления `has_permission(uid, board_id, permission)`:
      - если `is_system_admin(uid)` → `true` (глобальный override, см. 6.7),
      - иначе `false`, если нет строки в `board_members` для (`board_id`,`uid`),
      - иначе `true`, если существует `board_role_permissions` для membership.role с `permission=<perm>` и `allowed=true`.
    - Owner: owner — это membership с `is_owner=true`, которое при создании доски получает роль `board_admin` (полный набор прав). Отдельного “owner-permission override” в вычислении не требуется, но ограничения “нельзя лишить owner доступа/сменить роль/удалить” будут enforced в C5 (policy/RPC).
- [x] **C2 (done)** Реализовать helper‑функции в SQL: `is_system_admin(uid)`, `has_board_permission(uid, board_id, permission)`. DoD: покрывает правило системного админа.
    - Добавлена миграция `supabase/migrations/20260317130000_authz_helpers.sql`:
      - таблица `public.system_admins(user_id)` (конфиг sysadmin в репозитории/SQL; доступ на запись только `service_role`),
      - функции:
        - `public.is_system_admin(uuid)` и `public.is_system_admin()`,
        - `public.has_board_permission(uuid, uuid, text)` и `public.has_board_permission(uuid, text)`.
      - обе функции `STABLE SECURITY DEFINER` и могут безопасно использоваться внутри RLS policies (читают только `system_admins` + membership/role-permissions).
    - Миграция применена на remote через `supabase db push` (в `supabase migration list` local=remote).
- [x] **C3 (done)** Включить RLS и написать policies на все таблицы раздела 11. DoD: недоступные операции реально запрещены.
    - C3.1 (done): базовый слой RLS для `profiles`, `boards`, `board_members`, `board_roles`, `board_role_permissions` в миграции `supabase/migrations/20260317134000_rls_core_authz.sql` (применена на remote).
    - C3.2 (done): RLS для `board_invites` в миграции `supabase/migrations/20260317135000_rls_board_invites.sql` (select/insert/update/delete по `board.invite_members`, применена на remote).
    - C3.3 (done): RLS для `board_columns` в миграции `supabase/migrations/20260317140000_rls_board_columns.sql` (select по `board.view`, insert по `columns.create`, update по `columns.rename|columns.reorder`, delete по `columns.delete`, применена на remote).
    - C3.4 (done): RLS для `cards` (select+insert) в миграции `supabase/migrations/20260317141000_rls_cards_select_insert.sql` (select по `board.view`, insert по `cards.create` + created_by=auth.uid() и проверка column∈board; update/delete вынесены в C4/RPC, миграция применена на remote).
    - C3.5 (done): RLS для `card_assignees` в миграции `supabase/migrations/20260317142000_rls_card_assignees.sql` (select по `board.view` через `cards`; insert/delete по `cards.edit_any` или `cards.edit_own` для создателя; insert дополнительно требует membership assignee на доске; применена на remote).
    - C3.6 (done): RLS для `labels` и `card_labels` в миграции `supabase/migrations/20260317143000_rls_labels.sql` (labels CRUD по `labels.manage`, select по `board.view`; card_labels select по `board.view` через `cards`, insert/delete по `cards.edit_any` или `cards.edit_own` для создателя + label∈board; применена на remote).
    - C3.7 (done): RLS для `card_comments` (select+insert) в миграции `supabase/migrations/20260317144000_rls_card_comments_select_insert.sql` (select по `board.view` через `cards`, insert по `comments.create` + author=auth.uid(); update/delete вынесены в C4, миграция применена на remote).
    - C3.8 (done): RLS для кастомных полей (`board_field_definitions`, `board_field_select_options`, `card_field_values`) в миграции `supabase/migrations/20260317145000_rls_custom_fields.sql` (definitions/options CRUD по `card_fields.manage`, values CRUD по `cards.edit_any|cards.edit_own`, применена на remote через `supabase db push`).
    - C3.9 (done): RLS для оставшихся таблиц раздела 11 в миграции `supabase/migrations/20260317146000_rls_activity_notifications_preview.sql`: `card_activity` (select по `board.view`, insert только если `actor_user_id=auth.uid()` и есть соответствующее право на мутации карточки/комментов/меток/полей; в политике используется `cards.created_by_user_id`); `telegram_link_tokens` (CRUD по своему `user_id`); `notification_outbox` (RLS включен, политик для `authenticated` нет — только `service_role`); `notification_preferences` и `notification_user_settings` (CRUD только своих строк); `internal_notifications` (select/update только своих, insert — через `service_role`); `board_card_preview_items` (select по `board.view`, write по `card_preview.manage`). **Применение:** `supabase db push` на remote выполнен успешно после снятия паузы проекта; первый пуш падал из‑за опечатки `created_by` вместо `created_by_user_id` — исправлено в файле миграции до повторного push.
- [x] **C4 (done)** Политики “own vs any” для cards/comments (edit/delete). DoD: `*_own` работает только для создателя/автора.
    - Миграция `supabase/migrations/20260406100000_rls_cards_comments_update_delete.sql`: **cards** — `UPDATE` при `cards.edit_any` или (`cards.edit_own` и `created_by_user_id = auth.uid()`) или `cards.move`; `DELETE` при `cards.delete_any` или (`cards.delete_own` и создатель); триггер `enforce_cards_update_scope` не даёт роли только с `cards.move` менять title/description/board_id/создателя (разрешены колонка, position, `responsible_user_id`, `moved_to_column_at` + `updated_at`). **card_comments** — `UPDATE` при `comments.moderate` или (`comments.edit_own` и автор); `DELETE` при `comments.moderate` или (`comments.delete_own` и автор); триггер запрещает менять `card_id`/`author_user_id` без sysadmin. **Применение:** `supabase db push` на remote — успешно.
    - Проверка: в SQL Editor под пользователем с ролью только `edit_own` (без `edit_any`) попробовать `update cards set title = 'x' where id = <чужая карточка>` — должно быть отказано; обновить свою карточку — ок; под пользователем с `cards.move` без edit — сменить только `column_id`/`position` на чужой карточке — ок, сменить `title` — ошибка триггера. Для комментариев: чужой коммент без `moderate` — нельзя ни update, ни delete; свой — по `edit_own`/`delete_own`.
- [x] **C5 (done)** Owner‑ограничения: owner нельзя лишить доступа/сменить роль/удалить из доски. DoD: enforced в БД (policy/constraint) либо через RPC.
    - Миграция `supabase/migrations/20260406110000_enforce_board_owner_membership.sql`: частичный unique index `board_members_one_owner_per_board_idx` (ровно один `is_owner` на доску); триггер `board_members_enforce_owner` блокирует `DELETE` строки владельца, `UPDATE`, снимающий владение / меняющий `board_role_id` / `user_id` / `board_id` для строки владельца; исключение — каскадное удаление участников при `DELETE boards` (statement‑триггеры выставляют `app.board_delete_cascade`); обход — `service_role` и `is_system_admin(uid)`.
    - Применение: `supabase db push` на remote — успешно (миграция `20260406110000`).
    - Проверка: под обычным пользователем‑участником с правом на мутацию `board_members` (когда появятся политики/RPC) попытаться удалить строку владельца или сменить ему роль — ожидается ошибка; удаление доски — участники удаляются без ошибки. В SQL Editor как не‑sysadmin: `delete from board_members where is_owner = true` по своей доске — должно быть «cannot remove board owner…»; `delete from boards where id = …` — доска и membership удаляются.

### EPIC D — Инициализация доски: дефолты (роли/колонки/preview)
- [x] **D1 (done)** RPC “создать доску”: создаёт `boards`, owner membership, 4 пресет‑роли, permissions матрицу, 4 дефолт‑колонки, дефолт preview items. DoD: новая доска соответствует 14.4.3 и 14.5.6.
    - Миграция `supabase/migrations/20260406120000_create_board_with_defaults.sql`: функция `public.create_board_with_defaults(p_name text) RETURNS uuid` (`SECURITY DEFINER`, `search_path = public`); дефолт фона доски — `background_type='color'`, `background_color='#F5F5F5'`; роли `viewer` / `editor` / `basic` / `board_admin` с матрицей из 6.6; владелец — `board_members` с `is_owner=true` и ролью `board_admin`; колонки и превью как в 14.4.3 и 14.5.6; `GRANT EXECUTE … TO authenticated`.
    - Применение: `supabase db push` на remote — успешно (`20260406120000`).
    - Вызов из приложения: `supabase.rpc('create_board_with_defaults', { p_name: '…' })` (Server Action / клиент под сессией).
    - Проверка: после RPC — в SQL Editor `select * from boards where id = '<uuid>'`; `board_roles`/`board_role_permissions` по `board_id`; одна строка `board_members` с `is_owner`; четыре `board_columns` с ожидаемыми `name`/`column_type`/`position`; четыре `board_card_preview_items` (`title`, `assignees`, `comments_count`, `labels`), без `responsible` и `custom_field`.
- [x] **D2 (done)** Выдача списка досок: только участнику. DoD: `boards` list фильтруется RLS.
    - **БД:** политика `boards_select_by_permission` (`supabase/migrations/20260317134000_rls_core_authz.sql`) — `SELECT` для `authenticated` при `has_board_permission(id, 'board.view')`; хелпер требует строку в `board_members` с выданным правом (либо `is_system_admin`). Отдельная миграция для D2 не понадобилась.
    - **Приложение:** страница `web/src/app/boards/page.tsx` загружает `from('boards').select(...)` под сессией пользователя; видны только строки, проходящие RLS. Форма + server action `web/src/app/boards/actions.ts` вызывает `create_board_with_defaults` (D1) для smoke-теста списка.
    - **Миграции:** `supabase db push --dry-run` — `Remote database is up to date` (новых файлов миграций нет).
    - **Проверка:** залогиниться пользователем A, создать доску через форму на `/boards` — доска в списке. Пользователь B (не участник) под своей сессией: тот же запрос `select * from boards` в приложении или Supabase client — строки чужой доски нет. В SQL Editor от имени сервис-роли видны все строки; от имени JWT пользователя — только свои доски-участие.

### EPIC E — Инвайты по email + управление участниками/ролями
- [x] **E1 (done)** UI инвайта на доске (кнопка “+”, email). DoD: создаётся `board_invites` pending с ограничением “1 pending на email”.
    - Страница `web/src/app/boards/[boardId]/page.tsx`: заголовок доски (RLS), вычисление `canInvite` через `board_members` + `board_role_permissions.permission = 'board.invite_members'`.
    - Клиент: `invite-member-button.tsx` — круглая кнопка «+», модалка с полем email; `useFormState` + server action `inviteBoardMemberAction` в `actions.ts` — `insert` в `board_invites` со статусом `pending`, `invited_by_user_id = auth.uid()`, email нормализуется `trim` + `lower`.
    - Дубликат pending: обработка кода `23505` (partial unique `board_invites_one_pending_per_email`).
    - Список досок: ссылка с `/boards` на `/boards/[id]`.
    - **Миграции:** не требовались (схема/RLS уже есть).
    - **Проверка:** залогиниться владельцем доски → `/boards` → открыть доску → «+» → ввести email → в Supabase Table Editor в `board_invites` появилась строка `pending`; повторить тот же email — сообщение про активное приглашение. Пользователь с ролью без `board.invite_members` — кнопки «+» нет.
- [x] **E2 (done)** Автопринятие инвайта при логине/заходе в `/boards`: если email совпал — создать `board_members`, роль `basic`, инвайт accepted. DoD: инвайт → логин под тем же email → на `/boards` доска появляется в списке.
    - Миграция `supabase/migrations/20260406130000_accept_pending_board_invites.sql`: RPC `accept_pending_board_invites_for_current_user()` (`SECURITY DEFINER`), нормализация email `lower(trim)` для `profiles` и `board_invites`; для каждого `pending`-инвайта: роль `board_roles.key = 'basic'`, `INSERT` в `board_members` с `ON CONFLICT (board_id, user_id) DO NOTHING` (уже участнику роль не перетирается), затем `status = accepted`, `accepted_user_id = auth.uid()`; возвращает число принятых инвайтов. `GRANT EXECUTE … TO authenticated`.
    - Приложение: `web/src/app/boards/page.tsx` — после guard вызывается `supabase.rpc('accept_pending_board_invites_for_current_user')`, затем загрузка списка досок; при ошибке RPC — Toast.
    - **Применение:** `supabase db push` на remote — успешно (`20260406130000`).
    - **Проверка:** пользователь A создаёт доску, инвайтит email пользователя B → B регистрируется/логинится с тем же email → открывает `/boards` → доска A в списке; в Table Editor `board_invites` для этой строки `accepted` и `accepted_user_id = B`; `board_members` — строка B с ролью `basic`. Если email в профиле не совпадает с инвайтом (другой регистрационный email) — инвайт остаётся pending (ожидаемо).
- [x] **E3 (done)** UI списка участников: аватары + “+X”, страница/модал “Участники”. DoD: видимость по permissions.
    - **Приложение:** `web/src/app/boards/[boardId]/board-members.tsx` — стек из первых 3 аватаров (фото или инициалы), бейдж `+N` для остальных, подпись «Участники», по клику модал со списком (имя, email, роль, метка «Владелец»); подсказка про пригласить по «+» только при `board.invite_members`.
    - **Данные:** `page.tsx` — `board_members` + вложенные `profiles` / `board_roles`; доступ определяется RLS (`board.view` для select участников), страница доски и так недоступна без этого права.
    - **Миграции:** не требовались.
    - **Проверка:** зайти на `/boards/[id]` под участником — справа видны аватары и «Участники», модал показывает всех на доске; под пользователем без доступа к доске — 404/редирект, чужих участников не видно. При 4+ участниках — третья аватарка и `+N`. Пользователь с ролью без `invite` — в модале нет подсказки про кнопку «+».
- [x] **E4 (done)** UI управления ролями участникам (кроме owner). DoD: изменение роли отражается сразу в правах.
    - **БД:** миграция `supabase/migrations/20260406140000_rls_board_members_update_roles_manage.sql` — триггер `board_members_a_restrict_update_to_role_only` (для `authenticated` можно менять только `board_role_id`), RLS `board_members_update_roles_manage`: `UPDATE` при `has_board_permission(board_id, 'roles.manage')` и новая роль из `board_roles` этой же доски. Владелец по-прежнему блокируется триггером C5.
    - **Приложение:** `BoardMembersPanel` — для не-владельцев при `roles.manage` показывается `<select>` ролей доски; server action `updateBoardMemberRoleAction` в `actions.ts` (`revalidatePath`). `page.tsx` загружает роли доски и флаг `canManageRoles`.
    - **Применение миграции:** выполнено `supabase db push` из корня репозитория на remote проекта `doit` (`20260406140000_rls_board_members_update_roles_manage.sql` применена успешно).
    - **Проверка:** под пользователем с ролью «Администратор доски» открыть «Участники», сменить роль участника (не владельца) — в Table Editor `board_members.board_role_id` обновился; у этого пользователя пропадают/появляются действия согласно матрице прав (например, viewer не видит кнопку «+» если нет `invite`). Владелец — только текст роли, без селекта. Пользователь без `roles.manage` — без селекта.

### EPIC F — Экран “Доска”: колонки + карточки (CRUD) + DnD + позиции
- [x] **F1 (done)** Страница доски: загрузка board meta + columns + cards. DoD: корректная сортировка по `position`.
    - **Приложение:** `web/src/app/boards/[boardId]/page.tsx` — после guard загружаются `boards` (meta: `name`, `background_*`), `board_columns` с `.order('position', { ascending: true })`, `cards` по `board_id` с `.order('position')`; карточки группируются по `column_id`, внутри колонки дополнительно сортируются по `position`. UI: `board-canvas.tsx` — горизонтальный ряд колонок и список заголовков карточек; цвет фона доски из `background_color`, для `image` — заглушка-текст до H4.
    - **Миграции:** новых нет; `supabase db push` — `Remote database is up to date`.
    - **Проверка:** открыть `/boards/[id]` участником доски — четыре колонки в порядке из D1; при ручных вставках в SQL с разными `position` порядок колонок и карточек в колонке совпадает с сортировкой. Создание карточек из UI — в F4.
- [x] **F2 (done)** CRUD колонок (create/rename/retype/reorder/delete) с правами. DoD: соответствует 4.4 и 14.4.
    - **Приложение:** `column-types.ts` — типы и подписи RU; server actions в `boards/[boardId]/actions.ts`: `createBoardColumnAction` (имя до 50 символов, `position` = max+1), `updateBoardColumnAction` (имя + `column_type`), `moveBoardColumnAction` (swap `position` с соседом влево/вправо), `deleteBoardColumnAction` (сообщение при FK, если в колонке есть карточки). UI: `add-board-column-button.tsx` («+ Колонка»), `board-column-header.tsx` — счётчик карточек, бейдж типа по 14.4.1, стрелки порядка при `columns.reorder`, меню «изменить» / «удалить» при rename/delete.
    - **Права:** `page.tsx` читает `columns.create|rename|reorder|delete` из `board_role_permissions`; элементы UI скрыты без соответствующих флагов (RLS уже в `20260317140000_rls_board_columns.sql`).
    - **Миграции:** не требовались.
    - **Проверка:** под админом доски — «+ Колонка», создание, смена имени/типа, стрелки порядка, удаление пустой колонки; удаление колонки с карточкой — понятная ошибка. Под ролью только viewer — нет кнопок управления колонками (кроме просмотра). `supabase db push` — без новых файлов.
- [x] **F3 (done)** DnD колонок (persist `position`). DoD: перезагрузка сохраняет порядок.
    - **Приложение:** зависимости `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; клиент `web/src/app/boards/[boardId]/board-columns-dnd.tsx` — горизонтальный sortable, ручка «⋮⋮» у заголовка при `columns.reorder`; оптимистичный reorder + `reorderBoardColumnsAction` + откат при ошибке; `router.refresh()` после успеха. Без права reorder — статичный ряд колонок (как раньше). Стрелки ‹ › сохранены.
    - **Server action:** `reorderBoardColumnsAction` в `actions.ts` — проверка того же множества id, что в БД; выставление `position` = `0..n-1` по переданному порядку.
    - **Типы:** `BoardColumnPermissions` перенесён в `column-types.ts` (re-export из `board-canvas.tsx`).
    - **Миграции:** не требовались; схема `board_columns.position` без unique по пары `(board_id, position)`.
    - **Проверка:** под ролью с `columns.reorder` перетащить колонку за «⋮⋮», обновить страницу (F5) — порядок тот же; в Table Editor значения `position` — 0,1,2,… визуально. Под viewer без reorder — перетаскивания нет.
- [x] **F4 (done)** Модал “Создание карточки” (title + assignees + custom fields). DoD: валидирует 4.5.
    - **БД:** миграция `supabase/migrations/20260406150000_create_card_with_details_rpc.sql` — RPC `create_card_with_details(p_board_id, p_column_id, p_title, p_assignee_user_ids, p_field_values)` (`SECURITY DEFINER`, `search_path = public`): проверки `cards.create`, заголовок 1–200, минимум один assignee из `board_members`, колонка ∈ доски; `INSERT cards` + `card_assignees` + опциональные `card_field_values` по типам (`text`/`date`/`link`/`select`) с обязательностью из схемы; строка `card_activity` (`card_created`). `GRANT EXECUTE … TO authenticated`.
    - **Применение:** `supabase db push` на remote — успешно (`20260406150000`).
    - **Приложение:** `Modal` — закрытие по клику на затемнение (§4.5). `create-card-modal.tsx` — кнопка «+ Карточка» в колонке, модал с названием, чекбоксами участников (по умолчанию текущий пользователь, нельзя снять последнего), полями по `board_field_definitions` + опции select; `createCardAction` → RPC. Данные полей и участников на страницу доски (`page.tsx`), права `cards.create`.
    - **Проверка:** под ролью с `cards.create` — «+ Карточка» → заполнить → в Table Editor появились `cards`, `card_assignees`, при необходимости `card_field_values`, `card_activity`. Название 0 или >200 / 0 участников / обязательное поле пустое — ошибка (UI и/или сообщение из RPC). Клик по фону — модал закрывается без сохранения. Роль без `cards.create` — кнопки нет.
- [x] **F5 (done)** CRUD карточек: rename/edit description/delete (own/any). DoD: RLS соблюдён.
    - **Приложение:** `page.tsx` — выборка `description`, `created_by_user_id`, флаги `cards.edit_any|edit_own|delete_any|delete_own`; `column-types.ts` — `CardContentPermissions`, `BoardCardListItem`, хелперы `canEditCardContent` / `canDeleteCard`; `actions.ts` — `updateCardAction` / `deleteCardAction` (валидация названия 1–200, описание до 50k символов); после успешного `update` — строки `card_activity` (`card_renamed`, `description_updated`). `edit-card-modal.tsx` — модалка по клику на карточку (если есть право редактировать или удалять): поля название/описание, сохранение, удаление с подтверждением. `board-columns-dnd.tsx` + `board-canvas.tsx` — прокидывание прав и данных карточек; кликабельные карточки при наличии прав.
    - **Миграции:** новых нет; `npx supabase db push` — `Remote database is up to date`.
    - **Проверка:** под ролью с `edit_any` — открыть чужую карточку, сменить название/описание — в Table Editor строка обновлена, в `card_activity` появились события. Под ролью только `edit_own` — редактировать свою карточку — ок; чужую открыть нельзя (нет клика); попытка обхода через подделку id в action — отказ RLS/trigger. Удаление: `delete_any` / `delete_own` на своей — карточка исчезает с доски; viewer без этих прав — карточка не интерактивна для редактирования.
- [x] **F6 (done)** DnD карточек внутри/между колонками. DoD: обновляет `column_id`, `position`, `moved_to_column_at`, activity, realtime.
    - **БД:** миграция `supabase/migrations/20260406160000_reorder_board_cards_rpc.sql` — RPC `reorder_board_cards(p_board_id, p_layout jsonb)`: массив `{ column_id, card_ids[] }` по **всем** колонкам доски; проверка состава колонок/карточек; для каждой изменившейся позиции/colонки — `UPDATE cards` (при смене колонки — `moved_to_column_at = now()`); строка `card_activity` с `activity_type = card_moved` и payload from/to column+position. Права на перемещение каждой карточки: как у RLS UPDATE (`cards.move` | `edit_any` | `edit_own`+своя). В той же миграции — условное `ALTER PUBLICATION supabase_realtime ADD TABLE public.cards` (если публикация есть и таблица ещё не в ней).
    - **Приложение:** `reorderBoardCardsAction` → RPC; `page.tsx` — флаг `canMoveCards` по `cards.move`; `board-columns-dnd.tsx` — DnD карточек (хэндл ⋮⋮, `closestCorners`), оптимистичный порядок + откат при ошибке; порядок колонок для RPC совпадает с текущим рядом колонок. Подписка Realtime `postgres_changes` на `cards` с `board_id=eq.{boardId}` → `router.refresh()`.
    - **Применение миграции:** из корня репозитория `npx supabase db push --yes` (если зависает на подключении к remote — повторить при доступной сети/проекте без паузы). После push: в SQL Editor проверить `select proname from pg_proc where proname = 'reorder_board_cards';` и при необходимости `select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cards';`.
    - **Проверка:** пользователь с `cards.move` — перетащить карточку между колонками и внутри колонки, F5 — порядок сохранён; в Table Editor у карточки обновлены `column_id`/`position`/`moved_to_column_at` (при межколоночном переносе); в `card_activity` есть `card_moved`. Второй браузер/вкладка на той же доске после действий первого — обновление списка карточек без ручного F5 (если Realtime включён для проекта).
- [x] **F7 (done)** Автоназначение ответственного при переносе в `in_work` (14.4.4). DoD: responsible = actor; actor добавляется в assignees при необходимости; activity логируется.
    - **БД:** миграция `supabase/migrations/20260406170000_reorder_board_cards_auto_responsible_in_work.sql` — в `reorder_board_cards` при **смене колонки** на колонку с `column_type = 'in_work'`: `INSERT card_assignees (card_id, actor) ON CONFLICT DO NOTHING`, `UPDATE cards.responsible_user_id = auth.uid()`, затем как раньше `card_activity` с `card_moved` и дополнительно запись с `activity_type = 'responsible_auto_set'`, сообщение `Назначен ответственный: <display_name>` (из `profiles`). Пересортировка внутри той же `in_work` без смены колонки по правилу 14.4.4 не трогает ответственного; перенос из `in_work` в другую колонку ответственного не сбрасывает.
    - **Применение:** `npx supabase db push --yes --include-all` на remote — успешно (`20260406170000`).
    - **Проверка:** DnD карточки из «Очередь» в «В работе» под пользователем U — в `cards` поле `responsible_user_id = U`; если U не был в `card_assignees`, появилась строка assignee; в `card_activity` есть и `card_moved`, и `responsible_auto_set`. Повторный перенос в другую колонку `in_work` тем же или другим пользователем — ответственный перезаписан на переносившего. Перетаскивание только по порядку внутри «В работе» — `responsible_user_id` без изменений (если не менялась колонка).

### EPIC G — Модал карточки: участники/ответственный/метки/поля/история
- [x] **G1 (done)** Карточка: модал detail (левая часть) + sidebar комментариев (правая часть). DoD: структура как 4.6.2.
    - **UI:** `Modal` — опциональный `bodyClassName`, корпус диалога `flex flex-col overflow-hidden`, скролл в теле. `EditCardModal` — раскладка `md:flex-row`: слева detail-часть, справа `<aside>` с `CardCommentsSidebar` (заголовок «Комментарии», форма ввода сверху + «Отправить», лента новые сверху, автор/дата/текст, «Ответить» с контекстом ответа и сбросом ✕, превью родителя для reply).
    - **Обновление G1 (выполнено):**
      - Ширина модалки увеличена для комфортного редактирования (`max-w-6xl`).
      - На desktop зафиксирована пропорция колонок модалки карточки: левая часть `2/3`, комментарии `1/3` (соотношение `2:1`).
      - Поле “Название” удалено из блока “Детали”.
      - Заголовок карточки перенесён в шапку модалки: вместо статичного “Карточка” показывается текущее название.
      - Название в шапке редактируется по клику (инлайн input), `Enter/blur` — принять, `Escape` — отменить и вернуть исходное значение.
      - Для этого `Modal.title` расширен с `string` до `ReactNode` (поддержка интерактивного заголовка).
    - **Данные:** загрузка/вставка через Supabase browser client + RLS (`comments.create` / `board.view`); `deleted_at IS NULL`; после отправки — локальный refetch и `router.refresh()`.
    - **Права:** на странице доски читается `comments.create` → `canCreateComment` → `BoardCanvas` → `BoardColumnsDnD` → модалка.
    - **Участники для аватаров:** в `NewCardMemberOption` добавлен опциональный `avatarUrl`; `membersForNewCard` на `/boards/[id]` пробрасывает аватар из `BoardMemberPublic`.
    - **Миграции:** не требовались.
    - **Проверка:** открыть карточку на доске — две колонки на широком экране, на узком комментарии под блоком редактирования. Под ролью с `comments.create` — отправить комментарий и «Ответить»; в Table Editor `card_comments` с `reply_to_comment_id` при ответе. Под «Только просмотр» — лента видна (если есть `board.view`), поле ввода отключено.
- [x] **G2 (done)** Участники карточки: добавить/удалить с правилами (мин 1 участник). DoD: запрет на 0 участников; логируется activity.
    - **БД:** миграция `supabase/migrations/20260406180000_mutate_card_assignee_rpc.sql` — RPC `mutate_card_assignee(p_card_id, p_assignee_user_id, p_add boolean)` (`SECURITY DEFINER`): те же права, что RLS на `card_assignees` (`cards.edit_any` или `cards.edit_own` + создатель); при `p_add` — участник должен быть в `board_members`; дубликат assignee без второй записи в activity; при снятии последнего участника — исключение; при исключении текущего `responsible_user_id` — `UPDATE cards` + дополнительная строка `card_activity` с `responsible_unset`; типы событий `assignee_added` / `assignee_removed`.
    - **Применение:** `npx supabase db push --yes --include-all` на remote — успешно (`20260406180000`).
    - **Приложение:** `page.tsx` — загрузка `card_assignees` для всех карточек доски; `BoardCardListItem.assigneeUserIds`; `board-columns-dnd` — состояние модалки по `editingCardId`, карточка берётся из актуального `cardsById` после `refresh`; `edit-card-modal` — блок «Участники карточки» (чекбоксы при редактировании, список при read-only); server action `mutateCardAssigneeAction` → RPC.
    - **Проверка:** открыть карточку с правом редактирования — снять единственного участника: ошибка (UI + сообщение RPC). Добавить участника доски — появляется в списке и в Table Editor `card_assignees`; в `card_activity` — `assignee_added`. Исключить не последнего — `assignee_removed`; если исключённый был ответственным — в `cards.responsible_user_id` стало `NULL` и есть `responsible_unset`. Пользователь без `edit_*` на карточку модал не открывает (как раньше); с правом только удаления — read-only список участников.
- [x] **G3 (done)** Popover участника: “исключить”, “сделать ответственным” с правилами 4.6.1. DoD: права соблюдены; снятие responsible при исключении логируется.
    - **БД:** миграция `supabase/migrations/20260406190000_set_card_responsible_rpc.sql` — RPC `set_card_responsible_user(p_card_id, p_responsible_user_id)` (`SECURITY DEFINER`): те же права, что у `mutate_card_assignee` (`cards.edit_any` или `cards.edit_own` + создатель); цель должна быть в `card_assignees`; идемпотентность если уже ответственный; `UPDATE cards.responsible_user_id` + `card_activity` с `activity_type = 'responsible_set'`, сообщение «Назначен ответственный: …». Исключение ответственного и `responsible_unset` по-прежнему в `mutate_card_assignee` (G2).
    - **Применение:** `npx supabase db push --yes --include-all` на remote — успешно (`20260406190000`).
    - **Приложение:** `BoardCardListItem.responsibleUserId` + выборка в `page.tsx`; `edit-card-modal.tsx` — чипы участников (аватар, бейдж «Отв.»), по клику `Popover` (имя, email; при редактировании — «Сделать ответственным» / «Исключить из карточки»); добавление не на карточке — блок «Добавить участника с доски» с чекбоксами; `setCardResponsibleAction` → RPC.
    - **Проверка:** под ролью с `edit_*` на карточку — открыть чип участника → «Сделать ответственным» — в `cards.responsible_user_id` выбранный id, в `card_activity` строка `responsible_set`. Исключить текущего ответственного — `responsible_user_id` null и событие `responsible_unset` (как в G2). Пользователь только с `delete_*` без `edit_*` — чипы открываются без кнопок действий (только профиль). Пользователь только с `cards.move` без `edit_*` — назначение через UI недоступно (RPC откажет при обходе).
- [x] **G4 (done)** Метки: каталог меток доски + назначение/снятие на карточке. DoD: UI autocomplete; уникальность; activity.
    - **БД:** миграция `supabase/migrations/20260406210000_mutate_card_label_rpc.sql` — RPC `mutate_card_label(p_card_id, p_label_id, p_add)` (`SECURITY DEFINER`): те же права, что RLS на `card_labels` (`cards.edit_any` / `cards.edit_own`+создатель / участник карточки); метка должна принадлежать той же доске; `INSERT`/`DELETE` в `card_labels` + `card_activity` с `label_added` / `label_removed` только при фактическом изменении; дубликат пары `(card_id, label_id)` при добавлении — без второй записи в activity (`ON CONFLICT DO NOTHING`). `GRANT EXECUTE … TO authenticated`.
    - **Применение:** `npx supabase db push --yes` на remote — успешно (`20260406210000`).
    - **Приложение:** `page.tsx` — выборка `labels` доски и `card_labels` по карточкам; `BoardCardListItem.labelIds`; модалка `edit-card-modal` — блок «Метки»: чипы с цветом и снятием; поле поиска по названию и выпадающий список подсказок (autocomplete) для меток ещё не на карточке; `mutateCardLabelAction` → RPC. Права `canManageLabels` совпадают с правом редактировать тело карточки (редактор или assignee).
    - **Проверка:** в SQL Editor вставить тестовую строку в `labels` для доски (или дождаться H2); открыть карточку — добавить метку из подсказок, снять крестиком; в `card_labels` и `card_activity` появились согласованные строки (`label_added` / `label_removed`). Повторное добавление той же метки — без дубля в `card_activity`. Пользователь без права редактирования карточки — метки только просмотр (если модал доступна через delete-only, чипы без кнопок и без поля поиска).
- [x] **G5 (done)** Пользовательские поля: рендер по схеме board, редактирование значений, required‑валидация на create/update. DoD: типы 7.2 работают.
    - **БД:** миграция `supabase/migrations/20260406220000_update_card_body_and_custom_fields_rpc.sql` — RPC `update_card_body_and_custom_fields(p_card_id, p_title, p_description, p_field_values)` (`SECURITY DEFINER`): проверка прав как у RLS на тело карточки (`cards.edit_any` / `cards.edit_own`+создатель / участник карточки + `board.view`); обновление `title`/`description` при изменении; записи `card_activity` (`card_renamed`, `description_updated`, `field_value_updated`); для каждого определения поля доски — required-валидация и upsert/delete `card_field_values` по тем же правилам, что `create_card_with_details`. `GRANT EXECUTE … TO authenticated`.
    - **Применение:** `npx supabase db push --yes` на remote — успешно (`20260406220000`).
    - **Приложение:** общий модуль `web/src/app/boards/[boardId]/card-field-drafts.ts` (черновики, payload, `validateRequiredCustomFields`, `isValidHttpUrl`); `page.tsx` — загрузка `card_field_values` в `BoardCardListItem.fieldValues`; `create-card-modal` — клиентская проверка обязательных полей до RPC; `edit-card-modal` — блок «Поля доски» + `updateCardBodyAndCustomFieldsAction` → RPC; `board-columns-dnd` — прокинут `fieldDefinitions` в модалку.
    - **Проверка:** на доске с полями всех типов (через H1/SQL) открыть карточку — значения подставляются; изменить и «Сохранить» — в Table Editor `card_field_values` и `card_activity` с `field_value_updated`. Обязательное поле очистить и сохранить — ошибка (UI и RPC). Создание карточки без обязательного поля — ошибка на клиенте до вызова create. Участник карточки без `edit_own` на чужой карточке — редактирование полей доступно так же, как название (по правилу assignee).
- [x] **G6 (done)** История: вкладка “История” (card_activity) в порядке новые сверху. DoD: события из 8.1 фиксируются.
    - **Приложение:** в `web/src/app/boards/[boardId]/page.tsx` добавлена выборка `card_activity` по всем карточкам доски (`order by created_at desc`) и прокидывание в `BoardCardListItem.activityEntries` (тип добавлен в `column-types.ts`).
    - **UI:** в `web/src/app/boards/[boardId]/edit-card-modal.tsx` добавлен переключатель «Детали / История»; во вкладке «История» показываются события карточки (новые сверху) с сообщением, автором и локальным временем.
    - **Проверка:** открыть карточку, перейти на вкладку «История» — видны последние события (`card_moved`, `responsible_set`, `field_value_updated` и т.д.) в обратном хронологическом порядке; после нового действия и `router.refresh()` событие появляется сверху.

### EPIC H — Управление схемой: кастомные поля, метки, preview карточек, фон доски
- [x] **H1 (done)** UI “Поля” (board_admin): CRUD field_definitions + reorder + required + select options. DoD: соответствует 7.3–7.4.
    - **Приложение:** добавлен компонент `web/src/app/boards/[boardId]/board-fields-button.tsx` (кнопка «Поля» в шапке доски, модал управления схемой): создание/редактирование/удаление поля, переключение `is_required`, смена типа (`text|date|select|link`), изменение порядка полей (↑/↓). Для `select`-полей реализован CRUD вариантов + порядок (↑/↓) и изменение цвета.
    - **Server actions:** в `web/src/app/boards/[boardId]/actions.ts` добавлены мутации `create/update/delete/move` для `board_field_definitions` и `board_field_select_options` с валидацией (длины, тип поля, формат цвета `#RRGGBB`, принадлежность к доске/полю) и `revalidatePath`.
    - **Права:** в `web/src/app/boards/[boardId]/page.tsx` добавлено чтение permission `card_fields.manage`; UI «Поля» показывается только при этом праве (RLS остаётся источником истины на БД).
    - **Миграции:** не требовались (`board_field_definitions` / `board_field_select_options` и RLS из C3.8 уже покрывают сценарий).
    - **Проверка:** под ролью с `card_fields.manage` открыть доску → «Поля»; создать поле каждого типа, включить/выключить обязательность, поменять порядок, удалить поле. Для поля `select` добавить/обновить/удалить варианты и поменять порядок; убедиться в изменениях в таблицах `board_field_definitions` и `board_field_select_options`. Под ролью без `card_fields.manage` кнопка «Поля» не отображается, прямые мутации блокируются RLS.
- [x] **H2 (done)** UI “Метки” (labels.manage): CRUD + reorder. DoD: удаление метки каскадит `card_labels` и добавляет activity на карточки.
    - **БД:** миграция `supabase/migrations/20260407100000_delete_board_label_with_activity_rpc.sql` — RPC `delete_board_label_with_activity(p_board_id, p_label_id)` (`SECURITY DEFINER`): проверяет `labels.manage`, находит все затронутые карточки по `card_labels`, пишет `card_activity` (`label_removed`, `source = board_label_deleted`), затем удаляет метку; каскад удаления из `card_labels` обеспечивает FK. `GRANT EXECUTE … TO authenticated`.
    - **Приложение:** `web/src/app/boards/[boardId]/board-labels-button.tsx` расширен до полного CRUD+reorder: создание, редактирование названия/цвета, удаление, перемещение вверх/вниз в списке. В `web/src/app/boards/[boardId]/actions.ts` добавлены `updateBoardLabelAction`, `moveBoardLabelAction`; `deleteBoardLabelAction` переведён на RPC для логирования истории.
    - **Применение:** `supabase db push` на remote — выполнен успешно (`20260407100000`).
    - **Проверка:** под ролью с `labels.manage` открыть доску → «Метки»: создать метку, изменить цвет/название, подвигать порядок стрелками, удалить метку, которая назначена на 1+ карточек. Ожидание: из `card_labels` связи исчезли, а в `card_activity` затронутых карточек появились записи `label_removed` с payload `source=board_label_deleted`. Под ролью без `labels.manage` кнопки управления метками нет, прямые вызовы actions/RPC возвращают ошибку прав.
- [x] **H3 (done)** UI “Отображение карточек” (card_preview.manage): включение/выключение/порядок элементов + выбор custom_fields. DoD: 14.5 соблюдён, title всегда включён и первый.
    - **Приложение:** добавлен компонент `web/src/app/boards/[boardId]/board-card-preview-button.tsx` (кнопка «Отображение карточек» в шапке доски, модал управления элементами превью): включение/выключение (`enabled`), изменение порядка (↑/↓), добавление `custom_field` из доступных полей доски, удаление только `custom_field`. Для `title` выключение блокируется в UI.
    - **Server actions:** в `web/src/app/boards/[boardId]/actions.ts` добавлены `toggleBoardCardPreviewItemAction`, `moveBoardCardPreviewItemAction`, `createBoardCardPreviewCustomFieldItemAction`, `deleteBoardCardPreviewItemAction` с валидациями принадлежности к доске и обработкой прав `card_preview.manage`/ошибок RLS.
    - **Экран доски:** `web/src/app/boards/[boardId]/page.tsx` загружает `board_card_preview_items`, право `card_preview.manage` и `comments_count`; `web/src/app/boards/[boardId]/board-columns-dnd.tsx` рендерит карточки по конфигурации превью (участники, комментарии, метки, ответственный, custom field), сохраняя `title` отдельной строкой.
    - **Миграции:** не требовались (таблица `board_card_preview_items` и RLS из C3.9 уже покрывают сценарий).
    - **Проверка:** под ролью с `card_preview.manage` открыть доску → «Отображение карточек»: выключить/включить `assignees|comments_count|labels|responsible`, поменять порядок, добавить/удалить `custom_field`; карточки в колонках сразу показывают обновлённый набор полей. Попытка выключить `title` недоступна в UI и не проходит на сервере. Под ролью без `card_preview.manage` кнопка не отображается, прямые вызовы actions возвращают ошибку прав.
- [x] **H4 (done)** Фон доски (board.change_background): цвет или изображение (Storage). DoD: загрузка файла, сохранение path, отображение.
    - **БД/Storage:** миграция `supabase/migrations/20260407110000_board_background_storage.sql` — создан/обновлён bucket `board-backgrounds` (private, лимит 5MB, mime: jpeg/png/webp/gif), добавлены RLS policies на `storage.objects`: `SELECT` по `board.view`, `INSERT/UPDATE/DELETE` по `board.change_background` (board_id берётся из первого сегмента пути `name`).
    - **Server actions:** в `web/src/app/boards/[boardId]/actions.ts` добавлены `updateBoardBackgroundColorAction` и `updateBoardBackgroundImageAction` с валидацией hex/mime/размера, переключением `boards.background_type`, сохранением `background_image_path`, удалением старого файла фона при замене.
    - **UI:** новый компонент `web/src/app/boards/[boardId]/board-background-button.tsx` (кнопка «Фон» в шапке доски, модал выбора цвета или загрузки изображения). Кнопка доступна только при праве `board.change_background`.
    - **Рендер фона:** `web/src/app/boards/[boardId]/page.tsx` получает signed URL из Storage для `background_image_path`; `web/src/app/boards/[boardId]/board-canvas.tsx` отображает фон-изображение (cover/center) или цвет, удалена старая заглушка H4.
    - **Применение:** выполнить `supabase db push` (миграция `20260407110000`).
    - **Проверка:** под ролью с `board.change_background` открыть `/boards/[id]` → «Фон» → (1) выбрать цвет и применить, (2) загрузить изображение до 5MB; ожидание: в `boards` корректно меняются `background_type/background_color/background_image_path`, фон визуально обновляется. Под ролью без `board.change_background` кнопка «Фон» не отображается, прямые вызовы action/storage блокируются RLS.
    - **Hotfix:** миграция `supabase/migrations/20260407113000_fix_board_background_storage_policies.sql` — исправлены policies bucket `board-backgrounds` (безопасный парс первого сегмента пути через `CASE ... ::uuid`), чтобы исключить ошибку `invalid input syntax for type uuid` на не-UUID именах объектов.
    - **Hotfix 2:** миграция `supabase/migrations/20260407114500_allow_board_owner_background_storage.sql` — в policies bucket `board-backgrounds` добавлен явный bypass для владельца доски (`boards.owner_user_id = auth.uid()`) на `SELECT/INSERT/UPDATE/DELETE`, чтобы автор доски не блокировался при загрузке/смене фона даже при несогласованности role-permissions.
    - **Hotfix 3:** миграция `supabase/migrations/20260407120000_storage_board_background_policy_helpers.sql` — policies `board-backgrounds` переведены на `SECURITY DEFINER` helper-функции (`can_read_board_background_object` / `can_write_board_background_object`), чтобы проверки доступа не зависели от RLS на `boards` при выполнении policy `storage.objects`.
    - **Hotfix 4 (app):** в `web/src/app/boards/[boardId]/actions.ts` при установке фона-изображения `updateBoardBackgroundImageAction` теперь явно записывает `background_color = null` вместе с `background_type='image'` и `background_image_path`, чтобы соблюдать constraint `boards_background_check`.

### EPIC I — Комментарии: ответы, права, soft-delete
- [x] **I1 (done)** Создание комментария + reply_to_comment_id, UI “Ответить” + контекст ответа. DoD: 4.6.2.
    - **Приложение:** `web/src/app/boards/[boardId]/card-comments-sidebar.tsx` уже реализует весь поток I1: загрузка `card_comments` (только `deleted_at IS NULL`), создание комментария через `insert` с полями `card_id`, `author_user_id`, `body`, `reply_to_comment_id`; кнопка «Ответить» на каждом сообщении; контекст ответа над формой (автор + текст родительского комментария) и превью parent-комментария в ленте.
    - **Права:** отправка доступна только при `comments.create` (`canCreate`), без права поле ввода и кнопка отправки отключены; чтение списка комментариев работает в рамках `board.view` и RLS.
    - **Миграции:** не требовались (схема и RLS для `card_comments` уже закрыты в EPIC C).
    - **Проверка:** открыть карточку под ролью с `comments.create` → отправить обычный комментарий → нажать «Ответить» на нём → отправить reply; ожидание: в `card_comments` у ответа заполнен `reply_to_comment_id`, в UI у ответа виден контекст родителя. Под ролью без `comments.create` — отправка недоступна.
- [x] **I2 (done)** Редактирование/удаление комментариев по правам (own/moderate), soft-delete через `deleted_at`. DoD: удалённые не считаются в `comments_count`.
    - **БД:** миграция `supabase/migrations/20260407130000_card_comments_soft_delete.sql` — отключён `DELETE` policy для `card_comments` (жёсткое удаление пользователями), `UPDATE` policy расширен для `comments.delete_own` + `comments.moderate`, добавлен триггер `enforce_card_comments_soft_delete_scope` (запрет редактировать уже удалённый комментарий и запрет “restore” через `deleted_at -> NULL`).
    - **Приложение:** `web/src/app/boards/[boardId]/card-comments-sidebar.tsx` — inline-редактирование комментария, кнопка удаления (soft-delete) с подтверждением; кнопки показываются по правам (`comments.edit_own`, `comments.delete_own`, `comments.moderate`) и авторству. Добавлены server actions `updateCardCommentAction` и `softDeleteCardCommentAction` в `actions.ts`, включая запись `card_activity` (`comment_updated` / `comment_deleted`).
    - **Права в UI:** `page.tsx` теперь считывает `comments.edit_own`, `comments.delete_own`, `comments.moderate` и прокидывает флаги до модалки карточки.
    - **comments_count:** счётчик комментариев на карточке уже считает только `deleted_at IS NULL` (без изменений логики), что соответствует DoD.
- [x] **I3 (done)** Ограничение reply_to: только в рамках той же карточки. DoD: constraint/trigger/RPC не позволяет нарушить 11.12.
    - **БД:** ограничение уже зафиксировано триггером `card_comments_reply_same_card` в `supabase/migrations/20250316100000_initial_schema.sql` (функция `check_comment_reply_same_card()`): на `BEFORE INSERT OR UPDATE` проверяется, что `reply_to_comment_id` указывает на комментарий с тем же `card_id`, иначе выбрасывается ошибка `reply_to_comment_id must reference a comment on the same card`.
    - **Миграции:** новых не потребовалось (логика соответствует DoD).
    - **Проверка:** в SQL Editor попробовать создать/обновить комментарий с `reply_to_comment_id` от другой карточки — операция должна падать с ошибкой триггера; с `reply_to_comment_id` в пределах той же карточки — проходить.

### EPIC J — Realtime синхронизация (13.1)
- [x] **J1 (done)** Каналы подписки по board_id и маппинг событий на локальный state (columns/cards/comments/labels/members/settings/activity/fields/values/preview). DoD: второй клиент видит изменения без reload.
    - **Приложение:** `web/src/app/boards/[boardId]/board-columns-dnd.tsx` — realtime-канал расширен с точечной подписки только на `cards` до набора сущностей доски: `board_columns`, `cards`, `board_members`, `labels`, `board_field_definitions`, `board_field_select_options`, `board_card_preview_items`, `card_assignees`, `card_labels`, `card_comments`, `card_field_values`, `card_activity`. На любое событие выполняется `router.refresh()`, за счёт чего второй клиент получает обновления без ручного F5.
    - **Миграции:** не требовались.
    - **Проверка:** открыть одну доску в двух вкладках/браузерах под участниками. В первой вкладке поочерёдно изменить колонку/карточку/метку/комментарий/участника карточки/пользовательское поле. Ожидание: во второй вкладке соответствующие блоки доски обновляются автоматически (список колонок, карточки, превью, комментарии, история, участники) без ручной перезагрузки страницы.
- [x] **J2 (done)** Стратегия “last write wins” в UI (13.2). DoD: конфликт не ломает состояние; показываются последние данные.
    - **Приложение:** `web/src/app/boards/[boardId]/board-columns-dnd.tsx` — добавлена защита от stale-snapshot при конкуренции optimistic DnD и `router.refresh()`/realtime. Для порядка колонок и карточек введены `pending*SignatureRef`: после локальной перестановки фиксируется ожидаемая сигнатура (`columnsSignature`/`cardOrderRecordSignature`), и входящий server snapshot применяется только когда совпадает с ожидаемым состоянием (или когда pending нет). Это даёт поведение “last write wins” для последнего локального действия и исключает откат UI на старые данные во время гонок.
    - **Проверка:** в двух вкладках открыть одну доску; во вкладке A быстро выполнить 2+ DnD-переноса подряд (карточек/колонок), а во вкладке B в это же время сделать другой перенос. Ожидание: в A не происходит откат на промежуточный старый порядок после refresh, финально отображается последний подтверждённый порядок; при ошибке мутации остаётся явное сообщение и откат к предыдущему локальному состоянию.
- [x] **J3 (done)** Оптимизация: минимальные re-fetch и корректная сортировка после realtime (position). DoD: нет “прыжков” UI.
    - **Приложение:** `web/src/app/boards/[boardId]/board-columns-dnd.tsx` — realtime-обновления переведены на batched refresh: вместо немедленного `router.refresh()` на каждое событие используется короткий debounce (`~120ms`) и объединение пачек событий в один рефетч. Во время DnD (`onDragStart` → `onDragEnd/onDragCancel`) realtime refresh временно откладывается и выполняется после завершения перетаскивания, что убирает визуальные “скачки”/перерисовки в середине drag-жеста.
    - **Стабильность состояния:** существующая логика `pendingColumnSignatureRef/pendingCardSignatureRef` (J2) сохранена; вместе с batched refresh это снижает число конкурирующих snapshots и уменьшает откаты на промежуточные состояния при высокочастотных изменениях.
    - **Миграции:** не требовались.
    - **Проверка:** открыть одну доску в двух вкладках; в первой быстро выполнить несколько DnD карточек/колонок подряд, во второй параллельно менять карточки/комментарии/метки. Ожидание: в активной вкладке во время перетаскивания нет рывков от realtime-refresh, после завершения drag состояние синхронизируется; во второй вкладке обновления приходят без шквала множественных перерисовок на каждое одиночное событие.

### EPIC P — Оптимизация запросов экрана доски (DB/Auth/Storage)
Цель: снизить “шум” запросов (особенно при `router.refresh()`/realtime), чтобы маленькая доска (2 пользователя, 5 карточек) не генерировала сотни/тысячи запросов в час без реальной активности.

- [x] **P1 (done)** Бюджет и измерение запросов для `/boards/[boardId]`. DoD: есть целевые лимиты + повторяемая проверка.
    - **Инструментация (dev):** на странице доски добавлена панель “Perf: SSR запросы Supabase”, включается query‑параметром `?perf=1` (или `?__perf=1`). Считает SSR‑обращения Supabase по категориям: **DB** (`/rest/v1`), **Auth** (`/auth/v1`), **Storage** (`/storage/v1`) и **Other**.
      - Реализация: `web/src/lib/supabase/server.ts` (обёртка `fetch` при создании server client) + `web/src/app/boards/[boardId]/page.tsx` (агрегация и вывод).
    - **Что фиксируем:** сколько запросов допускается на (a) первую SSR‑загрузку, (b) один `router.refresh()`‑snapshot, (c) 10 действий подряд (DnD/комменты/метки) в 2 вкладках.
    - **Целевые бюджеты (после P2–P4):**
      - **(a) Первая SSR‑загрузка:** `DB <= 3`, `Auth <= 1`, `Storage <= 1` (только если фон‑картинка), `Total <= 6`.
      - **(b) Один refresh:** `DB <= 2`, `Auth <= 0`, `Storage <= 0`, `Total <= 2`.
      - **(c) 10 действий в 2 вкладках:** `DB <= 25` суммарно (в идеале \(~10–15\)), без “шторма” из десятков refresh на одно действие.
    - **Baseline (ожидаемо сейчас, до P2):** `DB ~ 15`, `Auth ~ 1`, `Storage 0–1` на одну SSR‑загрузку доски (зависит от фона).
    - **Повторяемая проверка (локально):**
      - Открыть `/boards/[boardId]?perf=1` и записать цифры панели.
      - Нажать `Ctrl+R` (или триггернуть `router.refresh()` через действие) и сравнить “до/после”.
      - Открыть 2 вкладки одной доски, выполнить 10 действий (DnD карточек, создать/удалить коммент, добавить/снять метку) и убедиться, что цифры не “взрываются” от refresh‑шторма.
    - **Повторяемая проверка (в Supabase):**
      - Supabase dashboard → Metrics (“Last 60 minutes”): 2 вкладки на одной доске → (1) idle 5 мин, (2) 10 действий → сравнить DB/Auth/Storage до/после оптимизаций.

- [x] **P2 (done)** Свести “snapshot доски” к 1–3 обращениям к БД. DoD: вместо 10–15+ запросов на SSR.
    - **БД:** добавлен RPC `public.get_board_snapshot(board_id)` (агрегированный JSON snapshot) в миграции `supabase/migrations/20260407140000_get_board_snapshot_rpc.sql` (применена на remote через `supabase db push`).
    - **Приложение:** `web/src/app/boards/[boardId]/page.tsx` переведена с 10+ отдельных `.from(...).select(...)` на один вызов `supabase.rpc('get_board_snapshot', { p_board_id })`; отдельно остаётся только Storage signed URL (если фон = image).
    - **Проверка:** открыть `/boards/[boardId]?perf=1` и сравнить счётчик DB с baseline — ожидаемо `DB ≈ 1` (RPC snapshot) + `Auth ≈ 1` + `Storage 0–1`.

- [x] **P3 (done)** Снизить Auth/Storage запросы при refresh. DoD: signed URL и auth-проверки не выполняются “лишний раз”.
    - **Auth (SSR):** `auth.getUser()` убран со страницы доски — текущий пользователь берётся из snapshot. Для этого RPC `get_board_snapshot` теперь возвращает `current_user_id` (миграция `supabase/migrations/20260407150000_get_board_snapshot_include_current_user_id.sql`, применена на remote через `supabase db push`).
    - **Storage (SSR):** создание signed URL перенесено на клиент и закэшировано в `localStorage` (TTL ~55 мин, ключ по `background_image_path`) в `web/src/app/boards/[boardId]/board-background-frame.tsx`. SSR больше не делает Storage‑запрос на каждый `router.refresh()`.
    - **Проверка:** открыть `/boards/[boardId]?perf=1` → ожидаемо `Auth = 0` и `Storage = 0` в SSR‑панели; если фон = image — фон подгружается через секунду на клиенте, без “шторма” запросов при `router.refresh()`.

- [x] **P4 (done)** Уменьшить число полных `router.refresh()` на realtime-события. DoD: мелкие изменения обновляются точечно.
    - **Подход:** разделить сущности на “обновляем локально по событию” vs “нужен snapshot”; для локальных обновлений поддерживать минимальный client-state (например, карточки/комменты/labels в памяти) и применять изменения по payload.
    - **Fallback:** если точечное применение сложно/опасно — оставить batched refresh, но с более умной фильтрацией (не реагировать на события вне открытой доски, не refresh на собственные optimistic-операции при совпадающей сигнатуре).
    - **Прогресс (2026-04-07):** в `web/src/app/boards/[boardId]/board-columns-dnd.tsx` реализованы точечные обновления локального state по realtime для самых шумных сущностей: `cards`, `board_columns`, `card_assignees`, `card_labels`, `card_field_values`, `card_comments` (обновление `commentsCount` с учётом soft-delete), `card_activity` (добавление entries в начало с дедупом по `id`). `router.refresh()` оставлен как fallback только когда payload не удалось применить локально.
    - **Следующий шаг (ускорение, 2026-04-07):** сделать “мгновенное” обновление порядка карточек у других клиентов при DnD: отправлять `broadcast` событие `card_layout` после успешного `reorder_board_cards` и применять layout на клиенте без `router.refresh()`.
    - **Выполнено (2026-04-07):** добавлен `broadcast` `card_layout` в `web/src/app/boards/[boardId]/board-columns-dnd.tsx`: на успехе DnD карточек компонент рассылает новый `cardOrderByColumn`, а остальные клиенты применяют его сразу (если не в процессе drag). Полный `router.refresh()` на успехе перемещения карточек убран (остался только fallback/очередь во время drag).
    - **Hotfix (2026-04-07):** добавлен UI‑индикатор статуса Realtime (`SUBSCRIBED`/ошибка) и fallback polling layout (раз в ~1s) для `board_columns` + `cards(id,column_id,position)`, который обновляет порядок карточек/колонок без ручного refresh, если websocket не подключается.
    - **Hotfix (2026-04-07):** поправлены зависимости realtime-effect в `board-columns-dnd.tsx` (добавлен `currentUserId`), чтобы сравнение `actorUserId === currentUserId` работало корректно даже при смене сессии/пользователя без полного перезапуска страницы.

### EPIC K — Браузерные + email уведомления и настройки (10.5–10.6)
- [x] **K1 (done)** Таблицы `internal_notifications`, `notification_preferences`, `notification_user_settings` + RLS. DoD: пользователь видит только своё.
    - **Схема:** таблицы и constraints определены в `supabase/migrations/20250316100000_initial_schema.sql`.
    - **RLS/policies:** включены и настроены в `supabase/migrations/20260317146000_rls_activity_notifications_preview.sql`:
      - `notification_preferences` и `notification_user_settings`: CRUD только своих строк (`user_id = auth.uid()`), sysadmin bypass.
      - `internal_notifications`: `SELECT/UPDATE` только своих; `INSERT` предполагается через `service_role`/`SECURITY DEFINER` (клиент не вставляет).
- [x] **K2 (done)** UI “Центр уведомлений”: список, отметка прочитанным, deeplink на доску. DoD: read_at ставится.
    - **Роут:** `web/src/app/notifications/page.tsx` (SSR, guard как у `/boards`).
    - **Действия:** `web/src/app/notifications/actions.ts`:
      - `markInternalNotificationReadAction` → выставляет `read_at` для одного уведомления (только если оно своё и ещё не прочитано).
      - `markAllInternalNotificationsReadAction` → выставляет `read_at` всем непрочитанным уведомлениям пользователя.
    - **Навигация/guard:** добавлена ссылка “Уведомления” в `web/src/app/layout.tsx`, а `web/src/middleware.ts` считает `/notifications` защищённым роутом.
- [x] **K3 (done)** UI “Настройки уведомлений”: timezone + тумблеры 4 типов × 2 канала, auto-save. DoD: как 10.6.3.
    - **Роут:** добавлен экран `web/src/app/notifications/settings/page.tsx`.
    - **UI:** `NotificationSettingsClient` — выбор IANA‑timezone, инфо‑плашка про правило “не уведомлять автора”, таблица 4 типов × 2 канала (Email/Браузерные) с автосохранением.
    - **Запись в БД:** server actions `updateNotificationTimezoneAction` и `setNotificationPreferenceEnabledAction` (upsert в `notification_user_settings` и `notification_preferences` под RLS).
    - **Навигация:** на `/notifications` добавлена ссылка “Настройки” → `/notifications/settings`.
    - **Проверка:** залогиниться → открыть `/notifications/settings` → сменить timezone и тумблеры; в Supabase Table Editor убедиться, что:
      - в `notification_user_settings` есть строка с `user_id` текущего пользователя и обновлённым `timezone`;
      - в `notification_preferences` появляются/обновляются строки `(user_id, channel, event_type, enabled)` для переключённых тумблеров.
- [x] **K4 (done)** Применение правила “не уведомлять автора” (10.6.2) и фильтрация по preferences. DoD: автор не получает ни browser, ни email.
    - **БД:** добавлена миграция `supabase/migrations/20260407153000_notification_delivery_filters.sql` с функцией `public.enqueue_notification_event(...)` (`SECURITY DEFINER`).
    - **Логика K4 в функции:** если `actor_user_id = user_id` → событие пропускается целиком (ни `internal_notifications`, ни `notification_outbox`); иначе каналы фильтруются по `notification_preferences` (если записи нет — `enabled=true` по умолчанию).
    - **Каналы:** при `browser`=enabled создаётся запись в `internal_notifications`; при `email`=enabled создаётся запись в `notification_outbox` со статусом `pending`.
    - **Применение миграции:** выполнено `npx supabase db push --yes`, миграция применена на remote без ошибок.
    - **Проверка:** в SQL Editor вызвать `select public.enqueue_notification_event(...)` с одинаковыми `p_user_id` и `p_actor_user_id` — ожидаемо `skipped=true` и новых строк нет; затем с разными id и отключённым `notification_preferences.enabled=false` для канала — запись в этот канал не создаётся.

### EPIC L — Telegram-канал (отложено до следующих версий)
- [ ] **L1 (todo, future)** Генерация одноразового токена (15 мин) + deep-link `t.me/<bot>?start=<token>`. DoD: токен одноразовый, used_at ставится.
- [ ] **L2 (todo, future)** Edge Function webhook для бота: принимает `/start <token>`, связывает chat_id с профилем. DoD: профиль хранит `telegram_chat_id`, `telegram_username`, `telegram_linked_at`.
- [ ] **L3 (todo, future)** “Отвязать Telegram” в профиле (UI + update). DoD: chat_id очищается.
- [ ] **L4 (todo, future)** Интеграция Telegram как дополнительного канала в существующий outbox-поток уведомлений. DoD: события корректные, ссылки/тексты формируются.
- [ ] **L5 (todo, future)** Outbox worker для Telegram: обработка pending, ретраи до 5, `failed` с error, backoff. DoD: повторные попытки происходят.
- [ ] **L6 (todo, future)** Тихие часы для Telegram: если включены — отправка откладывается до окончания окна в локальной timezone. DoD: pending не уходит в тихие часы.

### EPIC M — Системный админ (6.7)
- [ ] **M1 (todo)** Конфиг списка system admin (email/user_id) и проверка в SQL helper. DoD: sysadmin может всё даже без membership.
- [ ] **M2 (todo)** UI: для sysadmin не прятать действия (или показывать бейдж). DoD: доступность действий соответствует реальным правам.

### EPIC N — Полировка UX/качество
- [ ] **N1 (todo)** Валидации форм (title/lengths/required fields), ошибки Supabase красиво в UI. DoD: нет “тихих” фейлов.
- [ ] **N2 (todo)** Пустые состояния (нет досок/колонок/карточек/комментов). DoD: дружелюбные экраны.
- [ ] **N3 (todo)** Производительность (до 300мс на основные операции в “нормальной сети”): optimistic UI для DnD/CRUD, дебаунс переименований. DoD: субъективно быстро.
- [ ] **N4 (todo)** Timezone отображение дат/времени локально, хранение UTC. DoD: формат соответствует 15.

### EPIC O — Два интерфейса: телефон и ПК (mobile + desktop)
- [ ] **O1 (todo)** Стратегия и брейкпоинты: задать эталонную ширину «телефон» vs «ПК» (например `md`/`lg` в Tailwind, до 768px = телефон, от `md` = настольный режим — уточнить в реализации и закрепить в коде/комменте). DoD: один документированный порог, одинаково используемый в компонентах.
- [ ] **O2 (todo)** Shell приложения: **мобильный** (например компактный header, при необходимости нижняя навигация или overflow-меню) и **настольный** (текущий/расширенный header, шире контент). DoD: `/`, `/login`, `/boards` выглядят целенаправленно на узкой и широкой ширине.
- [ ] **O3 (todo)** Экран доски: **ПК** — горизонтальный канбан (колонки в ряд); **телефон** — отдельный паттерн (например свайп/табы по колонкам или вертикальный стек колонок), без обязательного горизонтального скролла всей доски как единственного решения. DoD: доска полезна на ширине 360–400px и на десктопе.
- [ ] **O4 (todo)** Модал карточки и тяжёлые формы: на **телефоне** — full-screen sheet или экран на весь viewport; на **ПК** — модальное окно/двухколоночный layout как в спецификации. DoD: открытие карточки комфортно на обоих классах устройств.
- [ ] **O5 (todo)** Регресс и DoD: пройти smoke сценарии (разд. 7) в **двух режимах** — эмуляция мобильного viewport + проверка на широком окне; по возможности одна проверка на реальном телефоне. DoD: нет нечитаемых элементов и нет обязательных hover-only действий на мобильном.

## 4) Карта зависимостей (важные блокировки)
- **C (RLS)** блокирует почти всё: E/F/G/H/I/K/L.
- **D (создание доски с дефолтами)** нужен перед F (экран доски) и H (настройки).
- **L (Telegram, future)** зависит от K (preferences/settings) и от событий/логики из F/G/I.
- **J (Realtime)** требует готовых таблиц + базовых UI‑состояний.
- **O (mobile + desktop)** пересекается с **F, G, H, K, N**: экраны доски, модал карточки, настройки и полировка должны закладываться с учётом двух интерфейсов; закрывать O целиком не обязательно до первого UI доски, но **O1–O2** желательно рано, **O3–O4** — вместе с F/G.

## 5) События → history/activity → notifications (единая матрица)
Агенту нужно обеспечить, чтобы любое важное действие:
1) изменяло основную таблицу (например, `cards`, `card_labels`, …),
2) писало строку в `card_activity` (8.1),
3) при необходимости порождало уведомления (10.2) в `notification_outbox` и/или `internal_notifications`,
4) уважало `notification_preferences` и правило “не уведомлять автора”.

### Минимальный “каталог” activity_type (рекомендация)
Сделать фиксированный справочник строк (например: `card_created`, `card_moved`, `responsible_auto_set`, `responsible_set`, `responsible_unset`, `assignee_added`, `assignee_removed`, `label_added`, `label_removed`, `comment_created`, `comment_updated`, `comment_deleted`, `description_updated`, `field_value_updated`, `field_definition_created`, `field_definition_deleted`, `board_background_changed`, …).

## 6) Реализация мутаций: предпочтительный подход
Чтобы соблюсти RLS и атомарность (особенно для: DnD, автоответственный, удаление метки с массовым activity, outbox), предпочтительно:
- простые операции: напрямую `insert/update/delete` через supabase-js (если RLS достаточно),
- сложные операции: **RPC (Postgres functions)** или **Edge Functions**, которые внутри делают несколько шагов транзакционно.

Список операций, которые почти наверняка лучше сделать как RPC:
- создание доски с дефолтами (D1),
- перенос карточки (F6/F7) + activity + outbox,
- исключение участника карточки с проверками и responsible-unset (G2/G3),
- удаление метки с каскадом activity по всем затронутым карточкам (H2),
- генерация email payload/шаблонов для outbox,
- outbox worker (L5/L6).

## 7) Минимальные ручные сценарии проверки (smoke)
Агент после каждого эпика должен уметь прогнать вручную (по возможности **дважды**: mobile viewport и desktop — см. **O5**):
- Логин/регистрация → профайл создан.
- Создать доску → есть 4 колонки, роли, preview.
- Инвайт по email → принять после логина.
- Создать карточку → минимум 1 участник.
- DnD карточки: queue → in_work (responsible = mover, activity есть).
- Комментарий + ответ.
- Метки добавить/снять.
- Кастомное поле создать → заполнить в карточке.
- Включить внутренние уведомления: получить по событию “card_moved”.
- Включить email-уведомления: получить тестовое письмо по событию “card_moved”.

## 8) Выходные артефакты (что должно появиться в репозитории)
- Приложение Next.js (frontend) + Tailwind с **двумя целевыми интерфейсами** (телефон и ПК), см. EPIC O.
- Supabase SQL миграции (schema + policies + functions).
- Worker/Edge Function для email outbox (или worker на cron).
- Док в `.ai` (этот план + при необходимости отдельный `decisions.md`).

