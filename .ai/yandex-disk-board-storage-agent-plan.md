# План реализации "Единая папка Яндекс.Диска на доску" (для AI-агента)

Основано на `.ai/yandex-disk-board-storage-specification.md`.

Цель плана: дать AI-агенту исполняемую декомпозицию для внедрения интеграции Яндекс.Диска на уровне доски, хранения вложений карточек через приложение, server-side контроля доступа, поддержки типа поля `Яндекс диск` в `Поля доски` и UI файловых полей карточки без выхода за рамки спецификации.

## 0) Зафиксированные требования спецификации
- Для одной доски поддерживается ровно одна активная интеграция Яндекс.Диска.
- Корневая папка доски должна жить строго по пути `/doit/boards/<boardId>/`.
- Подпапка карточек должна жить строго по пути `/doit/boards/<boardId>/cards/`.
- Файл вложения должен жить строго по пути `/doit/boards/<boardId>/cards/<cardId>/<attachmentId><extension>`.
- Исходное имя файла нельзя использовать как имя файла в Яндекс.Диске; оно хранится только в БД приложения.
- Все операции с файлами выполняются только через приложение; публичные ссылки и прямой шаринг не используются как основной механизм доступа.
- Подключать, переподключать и отключать интеграцию может только владелец доски.
- Возможность работы с файлами добавляется через `Поля доски`: в выпадающем меню `Тип` должен появиться вариант `Яндекс диск`.
- На одной доске можно создать несколько полей типа `Яндекс диск`.
- Каждое вложение карточки должно быть привязано к конкретному полю типа `Яндекс диск`, а не только к карточке в целом.
- Загружать и удалять файлы может только пользователь с правом редактирования содержимого карточки.
- Скачивать файлы может любой пользователь с правом просмотра карточки.
- Поле типа `Яндекс диск` в карточке должно оставаться видимым даже при недоступной интеграции.
- Поддерживаются только сценарии внутри открытой карточки; drag-and-drop на доску вне карточки не входит в доработку.
- Статусы интеграции фиксированы: `active | reauthorization_required | disconnected | error`.
- Статусы вложения фиксированы: `uploading | ready | failed`.
- В UI карточки показываются только вложения со статусом `ready`.
- `failed`-вложения и осиротевшие файлы должны очищаться служебной очисткой не позднее 24 часов.

## 1) Текущий технический контекст проекта

### 1.1. Что уже есть в коде
- `web/src/app/boards/[boardId]/page.tsx`
  - доска собирается через RPC `get_board_snapshot`;
  - права в UI уже вычисляются централизованно из `allowed_permissions`;
  - в шапке доски уже есть `BoardSettingsMenu`.
- `web/src/app/boards/[boardId]/edit-card-modal.tsx`
  - карточка уже открывается в модалке с вкладкой `Детали`;
  - внутри уже есть стабильные секции: описание, поля доски, участники, метки, удаление, комментарии;
  - это основная точка врезки для отображения полей типа `Яндекс диск` внутри блока пользовательских полей.
- `web/src/app/boards/[boardId]/board-settings-menu.tsx`
  - уже содержит паттерн кнопок-настроек уровня доски (`BoardLabelsButton`, `BoardFieldsButton`, `BoardCardPreviewButton`, `BoardBackgroundButton`);
  - это естественная точка входа в `Поля доски`, где должен появиться новый тип поля `Яндекс диск`.
- `web/src/app/boards/[boardId]/board-fields-button.tsx`
  - уже содержит форму создания/редактирования определений полей доски и выпадающий список `Тип`;
  - это основная точка для добавления `fieldType = "yandex_disk"` и сценариев управления этим типом поля.
- `web/src/app/boards/[boardId]/actions.ts`
  - проект уже использует паттерн `server action -> supabase -> revalidatePath`;
  - для сложных мутаций уже применяются RPC-функции (`create_card_with_details`, `update_card_body_and_custom_fields`, `delete_board_label_with_activity`);
  - здесь уже живут действия каталога полей доски, значит поддержку нового типа надо добавлять в существующий контур, а не в отдельный feature-остров.
- `supabase/migrations/20260407150000_get_board_snapshot_include_current_user_id.sql`
  - snapshot уже агрегирует данные доски, колонок, карточек, полей, меток, комментариев и activity;
  - расширение snapshot под интеграцию/вложения соответствует текущему стилю проекта.
- `supabase/migrations/20250316100000_initial_schema.sql`
  - есть таблицы `boards`, `board_members`, `board_columns`, `cards`, `card_comments`, `board_field_definitions` и прочая база доски;
  - `boards.owner_user_id` уже существует, значит owner-only правила можно реализовывать без новой роли.

### 1.2. Что в проекте пока отсутствует
- Нет таблиц под привязку Яндекс.Диска к доске.
- Нет таблиц под вложения карточек.
- Нет Yandex OAuth flow, callback-handlers и клиента для API Яндекс.Диска.
- Нет шифрования токенов интеграции и нет готового crypto helper под такие секреты.
- Нет server-side API для загрузки, скачивания и удаления файлов карточек.
- Нет поддержки типа поля `yandex_disk` в `board_field_definitions`, UI `Поля доски` и связанных TS-типах.
- Нет UI файловых полей `Яндекс диск` внутри блока пользовательских полей карточки.
- Нет фоновых служебных задач для очистки `failed`-вложений и осиротевших файлов.

### 1.3. Практический вывод для агента
- Это не локальная UI-правка, а вертикальный slice через БД, OAuth, API-клиент, server actions, snapshot, `Поля доски`, карточку и очистку.
- Главный риск регрессий находится не в верстке, а в консистентности: права, токены, жизненный цикл интеграции, cleanup и соответствие файлов в Яндекс.Диске записям в БД.

## 2) Предлагаемая техническая рамка реализации
- Хранить привязку Яндекс.Диска в отдельной таблице уровня board.
- Хранить вложения карточек в отдельной таблице уровня card, но с обязательной ссылкой на `board_field_definitions.id` для поля типа `yandex_disk`.
- Все обращения к Яндекс.Диску инкапсулировать в отдельный серверный модуль-клиент, а не размазывать по UI.
- Токены хранить только в зашифрованном виде; ключ шифрования брать из server-side env.
- Проверки прав оставлять на стороне приложения и БД; UI не является источником истины.
- Для загрузки/удаления/скачивания использовать server route handlers или server actions, но сами сетевые вызовы к Яндексу должны жить в серверных функциях, недоступных клиенту.
- Snapshot доски расширять только теми данными, которые реально нужны SSR/UI, без утечки токенов и внутренних служебных полей; ready-вложения должны быть сгруппируемы по файловому полю.
- Cleanup оформлять как отдельный служебный сценарий, который можно запускать cron-джобой/вручную.

## 3) Стратегия выполнения
1. Сначала зафиксировать доменную модель и БД.
2. Затем поднять безопасный Yandex OAuth и токенный слой.
3. После этого собрать server-side операции интеграции доски.
4. Затем собрать server-side операции вложений карточек.
5. После этого расширить snapshot и UI уровня `Поля доски`/карточки.
6. В конце реализовать cleanup, диагностику ошибок и приёмку по матрице сценариев.

Критическое правило порядка:
- Нельзя начинать полноценный UI полей типа `Яндекс диск`, пока не готовы таблицы, токены, клиент Яндекса и server-side контракты.

## 4) Трекер задач (живой чеклист)
Статусы: `todo | doing | blocked | done`.

### Прогресс (журнал)
| Дата | Задача | Что сделано |
|------|--------|-------------|
| 2026-04-10 | YDB1.1 | Миграция `20260410180000_board_yandex_disk_integrations.sql`: таблица `board_yandex_disk_integrations`, поля по спец. 7.1, `UNIQUE(board_id)`, индекс по `status`, CHECK статусов, FK на `boards` CASCADE и `profiles` SET NULL, токены nullable для состояний без секрета, RLS включён без политик (политики — YDB1.4), триггер `updated_at`. `supabase db push` применён. |
| 2026-04-10 | YDB1.2 | Миграция `20260410181000_card_attachments.sql`: таблица `card_attachments`, поля по спец. 7.2, `storage_provider` с CHECK `yandex_disk`, статусы `uploading|ready|failed`, индексы на `card_id`, `board_id`, `status`, FK `board_id`/`card_id` CASCADE, `uploaded_by_user_id` → `profiles` RESTRICT, RLS без политик. `supabase db push` применён. |
| 2026-04-11 | YDB1.3 | Миграция `20260411120000_ydb1_3_fk_delete_rules.sql`: `UNIQUE (id, board_id)` на `cards` для цели составного FK; `card_attachments (card_id, board_id) REFERENCES cards (id, board_id) ON DELETE CASCADE`; комментарии к таблицам/ограничению про спец. 9.6 (disconnect ≠ удаление на Диске), 12.4 (каскад БД при удалении карточки, провайдер — приложение). `supabase db push` применён. |
| 2026-04-11 | YDB1.4 | Миграция `20260411143000_ydb1_4_rls_integrations_attachments.sql`: функция `can_edit_card_content(uuid)` (как у `card_field_values`); `REVOKE SELECT` на `board_yandex_disk_integrations` для `authenticated`/`anon` (клиент не читает токены); политики INSERT/UPDATE/DELETE интеграции — только `boards.owner_user_id` или sysadmin; `card_attachments`: SELECT только `status = 'ready'` + `board.view` + согласованная пара `(card_id, board_id)`; INSERT/UPDATE — право редактирования содержимого карточки, `uploaded_by_user_id = auth.uid()` на INSERT; DELETE — то же или `cards.delete_any` / `delete_own` по карточке (для CASCADE при удалении карточки). `npx supabase db push` применён (вместе с YDB1.5). |
| 2026-04-11 | YDB1.5 | Миграция `20260411160000_ydb1_5_status_checks_documented.sql`: CHECK на статусы уже заданы в YDB1.1/YDB1.2 (`active|reauthorization_required|disconnected|error` и `uploading|ready|failed`); добавлены `COMMENT ON CONSTRAINT` для каталожной фиксации допустимых значений. `npx supabase db push` применён. |
| 2026-04-11 | YDB2.1 | `web/src/lib/yandex-disk/integration-env.ts`: `getYandexDiskIntegrationEnv()` с `import "server-only"`, ленивая валидация `YANDEX_DISK_OAUTH_*` и `YANDEX_DISK_TOKEN_ENCRYPTION_KEY` (мин. длина ключа 32), проверка абсолютного http(s) redirect URI; понятные `Error` на русском. Зависимость `server-only`. Пример переменных в `web/.env.local.example`. Миграций нет. |
| 2026-04-11 | YDB2.2 | `web/src/lib/yandex-disk/token-crypto.ts`: `encryptSecret` / `decryptSecret`, `server-only`, ключ из `getYandexDiskIntegrationEnv()`, производный AES-256 ключ через SHA-256 от passphrase; хранение `v1.` + base64url(iv12 ‖ tag16 ‖ ct), AES-256-GCM; пустой plaintext запрещён; v2 можно добавить отдельным префиксом. Комментарий в `.env.local.example` про неизменность ключа. Миграций нет. |
| 2026-04-11 | YDB2.3 | `web/src/lib/yandex-disk/yandex-disk-client.ts`: server-only клиент OAuth (`exchangeAuthorizationCodeForTokens`, `refreshAccessToken` → `oauth.yandex.com/token`) и REST Диска (`cloud-api.yandex.net/v1/disk`): `fetchLoginProfile`, `getDiskResourceMeta`, `diskResourceExists`, `diskCreateFolder`, `diskEnsureFolder`, `diskEnsureFolderChain`, `diskGetUploadLink`, `diskGetDownloadLink`, `diskDeleteResource`, `diskPutUpload`. Ошибки через `YandexDiskClientError` + коды (`oauth_invalid_grant`, `unauthorized`, `not_found`, `already_exists`, и т.д.) для YDB2.4. Миграций нет. |
| 2026-04-11 | YDB2.4 | `web/src/lib/yandex-disk/yandex-disk-product-messages.ts`: константы текстов разд. 15.2–15.3 спеки + безопасная заглушка для сетевых сбоев OAuth/login; `mapYandexDiskClientErrorToProductMessage(err, operation)` (`oauth_authorize` \| `oauth_refresh` \| `integration_folder` \| `upload` \| `download` \| `delete` \| `profile` \| `generic_disk`). В `yandex-disk-client.ts`: в `message` больше не подставляются сырые `message`/`error_description` API; добавлены `rawProviderMessage`, `oauthGrantType`; `postOAuthForm` принимает grant_type; ошибки профиля login.yandex.ru маппятся по HTTP через `diskStatusToCode`. Миграций нет. |
| 2026-04-11 | YDB3.1 | `web/src/lib/yandex-disk/board-yandex-disk-integration-access.ts`: `requireBoardYandexDiskIntegrationManagement(supabase, boardId)` — сессия, затем `is_system_admin` (как RLS), иначе `boards.owner_user_id` без ролевых прав; сообщение отказа через `YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY` в `yandex-disk-product-messages.ts` (спец. 8.1). Миграций нет. |
| 2026-04-11 | YDB3.2scope | OAuth `scope`: Яндекс не знает `cloud_api:disk.read_write` → `invalid_scope`; в `oauth/start` задано `cloud_api:disk.read cloud_api:disk.write` (пробел). В кабинете oauth.yandex.ru у приложения должны быть отмечены те же права на Диск. |
| 2026-04-11 | YDB3.2fix | Миграция `20260411193000_can_manage_board_yandex_disk_integration.sql`: RPC `can_manage_board_yandex_disk_integration` (SECURITY DEFINER) — владелец или sysadmin без зависимости от RLS `boards` SELECT. `requireBoardYandexDiskIntegrationManagement` переведён на RPC. OAuth start: `normalizeBoardIdQueryParam` (`web/src/lib/board-id-param.ts`), алиас `board_id`, снята строгая regex-версия UUID. `supabase db push` применён. |
| 2026-04-11 | YDB3.2 | `web/src/lib/yandex-disk/oauth-state.ts`: подписанный state (HMAC-SHA256 от ключа, производного от `YANDEX_DISK_TOKEN_ENCRYPTION_KEY`): `boardId`, `userId`, `exp` (10 мин), `nonce`; `verifyYandexDiskOAuthState` для callback (YDB3.3). `GET web/src/app/api/yandex-disk/oauth/start/route.ts`: валидация UUID доски, env, сессия Supabase, только владелец/sysadmin через `requireBoardYandexDiskIntegrationManagement`, редирект на `https://oauth.yandex.com/authorize` с `scope=cloud_api:disk.read cloud_api:disk.write`, `state`, `redirect_uri` из env. Без сессии → `/login`, не владелец → `/boards/{id}`. Миграций нет. |
| 2026-04-11 | YDB3.3 | `GET web/src/app/api/yandex-disk/oauth/callback/route.ts`: проверка `state`, сессии (`user.id === state.uid`), `requireBoardYandexDiskIntegrationManagement`; обмен кода → `fetchLoginProfile`; `diskEnsureFolderChain` для `/doit/boards/<boardId>/cards`; `upsert` в `board_yandex_disk_integrations` (`onConflict: board_id`): токены через `encryptSecret`, `root_folder_path=/doit/boards/<boardId>`, `status=active`, `last_authorized_at`, `last_error_text=null`. Ошибки OAuth/Диска → редирект на доску с `yandex_disk_oauth=…` (без утечки текста в URL); логи с продуктовым маппингом. `LoginForm`: после входа редирект на безопасный `?next=` (для возврата с `/login` после OAuth). Миграций нет. |
| 2026-04-11 | YDB3.4 | Повторное подключение: инвариант «одна строка на доску» уже из `UNIQUE(board_id)` (YDB1.1) + `upsert` по `board_id`. Вынесено в `web/src/lib/yandex-disk/board-yandex-disk-integration-oauth-persist.ts` (`upsertBoardYandexDiskIntegrationAfterOAuth`) с JSDoc YDB3.4/YDB3.5; callback вызывает хелпер. Новых миграций нет. |
| 2026-04-11 | YDB3.5 | Миграция `20260411204500_yandex_disk_oauth_account_change_allowed.sql`: RPC `yandex_disk_oauth_account_change_allowed(board_id, new_yandex_account_id)` (SECURITY DEFINER, `can_manage` + чтение интеграции/вложений) — `false`, если аккаунт меняется и есть `card_attachments.status = 'ready'` на доске. OAuth callback: после `fetchLoginProfile` вызов RPC; при `false` — редирект `yandex_disk_oauth=cannot_change_with_files`, в лог — `YANDEX_DISK_MSG_CANNOT_CHANGE_DISK_WITH_FILES`. `boards/[boardId]/page.tsx`: баннер с тем же текстом из константы. `npx supabase db push` применён. |
| 2026-04-11 | YDB3.6 | Миграция `20260411220000_disconnect_board_yandex_disk_integration.sql`: RPC `disconnect_board_yandex_disk_integration(board_id)` (SECURITY DEFINER) — проверка `can_manage`, затем `UPDATE`: `status=disconnected`, обнуление зашифрованных токенов и `access_token_expires_at`/`last_error_text`; строки вложений и файлы на Диске не трогаются. `web/src/app/boards/[boardId]/yandex-disk-integration-actions.ts`: server action `disconnectBoardYandexDiskIntegrationAction` (двойная проверка прав через `requireBoardYandexDiskIntegrationManagement` + RPC), ответы `forbidden`/`not_found`/`ok`, `revalidatePath` доски. `npx supabase db push` применён. UI кнопки «Отключить» — в YDB7.4. |
| 2026-04-11 | YDB3.7 | `web/src/lib/yandex-disk/board-yandex-disk-access-token.ts`: `ensureBoardYandexDiskAccessToken(boardId, { skewSeconds? })` — чтение строки интеграции через `getSupabaseServiceRoleClient` (обход REVOKE SELECT); при свежем access (запас по умолчанию 120 с) возврат токена; иначе `refreshAccessToken`; успех → шифрование и `UPDATE` (`active`, срок access, очистка `last_error_text`). Фатальный OAuth (`oauth_invalid_grant`, `oauth_invalid_client`, `unauthorized`) и отсутствие/битые токены → `reauthorization_required`, обнуление секретов, `last_error_text = YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED`. Сетевые/прочие сбои refresh → ответ `refresh_transient` без смены статуса. `disconnected` / нет строки — отдельные ветки. Константа `YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED` в `yandex-disk-product-messages.ts`; уточнён комментарий к `service-role.ts`. Миграций нет; вызов из upload/download — в YDB4/YDB5. |
| 2026-04-11 | YDB4.1 | Контракт загрузки: `web/src/lib/yandex-disk/validate-card-attachment-upload-request.ts` — `validateCardAttachmentUploadRequest(supabase, { boardId, cardId, files: { name, size }[] })` (спец. 10.2–10.4 п. 1–2): сессия, UUID через `normalizeUuidParam`, лимиты 20 файлов / 50 МБ / непустой файл / 200 `ready` на карточку, карточка на доске, RPC `can_edit_card_content`, интеграция только `active` (иначе тексты из `yandex-disk-product-messages.ts`). Константы лимитов экспортированы. `web/src/app/boards/[boardId]/card-attachment-upload-actions.ts`: `cardAttachmentUploadPrecheckAction(boardId, cardId, formData)` — точка входа, поле `files`. В `board-id-param.ts` добавлен `normalizeUuidParam` (доска — алиас). Новые строки разд. 15.1/15.3 в `yandex-disk-product-messages.ts`. Миграций нет. Реальная загрузка в Диск — YDB4.3+. |
| 2026-04-11 | YDB4.2 | Pre-upload по спец. 10.2 закрыт тем же модулем, что и YDB4.1: до вызовов API Диска проверяются ≤20 файлов за операцию, `ready + batch ≤ 200`, размер ≤50 МиБ (`CARD_ATTACHMENT_UPLOAD_MAX_FILE_BYTES`), `size > 0`, плюс п. 10.4(1–2) (права, активная интеграция). Типы файлов: спец. 10.3 — без ограничений. Отдельного кода/миграций не добавлялось; чеклист YDB4.2 помечен `done`. |
| 2026-04-11 | YDB4.3 | `yandex-disk-card-attachment-paths.ts`: `yandexDiskCardAttachmentDirectoryPath` → `/doit/boards/<boardId>/cards/<cardId>`. `ensure-yandex-disk-card-attachment-folder.ts`: `ensureBoardYandexDiskAccessToken` + `diskEnsureFolderChain` (идемпотентно, в т.ч. если нет родителя `cards`). `cardAttachmentUploadPrecheckAction`: после успешного `validateCardAttachmentUploadRequest` вызывает ensure папки; ошибки Диска → `mapYandexDiskClientErrorToProductMessage(..., integration_folder)`. Миграций нет. |
| 2026-04-11 | YDB4.4 | `yandex-disk-card-attachment-paths.ts`: `yandexDiskCardAttachmentObjectPath`. `card-attachment-upload-pipeline.ts`: суффикс файла на Диске из безопасного расширения; `uploadOneCardAttachmentFile` — INSERT `uploading` (явный `id` = UUID), `ensureBoardYandexDiskAccessToken`, `diskGetUploadLink` + `diskPutUpload`, UPDATE `ready`; после INSERT при любой ошибке — UPDATE `failed`. `cardAttachmentUploadAction`: валидация + папка + цикл по файлам, `revalidatePath` при любом успехе; ответ по файлам для YDB4.5. Миграций нет; `npx supabase db push` — без изменений. |
| 2026-04-11 | YDB4.5 | Частичный успех batch уже обеспечивается циклом без сквозной транзакции + `CardAttachmentUploadFileItemResult` на файл. Зафиксирован контракт в JSDoc: верхний уровень `ok: true` = batch обработан, детали в `files[]`; успехи не откатываются при ошибке соседа. Миграций нет. |
| 2026-04-11 | YDB4.6 | `web/src/lib/yandex-disk/list-card-attachments.ts`: `listReadyCardAttachmentsForViewer` — сессия, проверка пары доска/карточка, SELECT только `ready` + поля для UI (без `storage_path`); RLS дублирует ограничение. `listCardAttachmentsAllStatusesForServiceRole` — service-role, все статусы для cleanup YDB9 (без проверки прав пользователя, JSDoc). `web/src/app/boards/[boardId]/card-attachment-list-actions.ts`: `listReadyCardAttachmentsAction`. Миграций нет. |
| 2026-04-11 | YDB5.1 | `require-active-board-yandex-disk-integration.ts` — общая проверка `active` для загрузки/скачивания; `validate-card-attachment-upload-request.ts` переведён на неё. `resolve-card-attachment-temporary-download-url.ts`: сессия, SELECT `ready`+`storage_path` под RLS (`board.view`), активная интеграция, `ensureBoardYandexDiskAccessToken`, `diskGetDownloadLink` → временный URL. `GET .../api/boards/[boardId]/cards/[cardId]/attachments/[attachmentId]/download` — 302 на URL Яндекса или JSON `{ message }` с кодом ошибки. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB5.2 | Спец. 11.3: каждый GET скачивания по-прежнему запрашивает новый URL у Диска (без серверного кэша). `download/route.ts`: `dynamic = "force-dynamic"`, заголовки `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate` и `Pragma: no-cache` на JSON и на 302. Константа `CARD_ATTACHMENT_DOWNLOAD_TEMPORARY_URL_MAX_APP_CACHE_SECONDS = 300` в `resolve-card-attachment-temporary-download-url.ts` как верхняя граница прикладного кэша при будущем UI. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB5.3 | Спец. 11.4: при `YandexDiskClientError` с `code === "not_found"` после `diskGetDownloadLink` ответ HTTP 404 и текст `YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK`; мутаций `card_attachments` нет. Явная ветка в `resolve-card-attachment-temporary-download-url.ts`, JSDoc (11.4 + отсутствие удаления строки). В `yandex-disk-client.ts` у `diskGetDownloadLink` — привязка 404/`DiskNotFoundError` к `not_found`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB5.4 | `web/src/lib/yandex-disk/delete-card-attachment.ts`: `deleteCardAttachment` — сессия, `can_edit_card_content`, только `status=ready`, активная интеграция + `ensureBoardYandexDiskAccessToken`, `diskDeleteResource` затем `DELETE` строки; `not_found` от Диска → удаление строки (спец. 12.3). Константа `YANDEX_DISK_MSG_NO_DELETE_PERMISSION` (спец. 15.1). `web/src/app/boards/[boardId]/card-attachment-delete-actions.ts`: `deleteCardAttachmentAction` + `revalidatePath`. RLS DELETE уже в YDB1.4. Новых миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB5.5 | `web/src/lib/yandex-disk/best-effort-delete-yandex-disk-objects-on-card-delete.ts`: `bestEffortDeleteYandexDiskObjectsForCard` — service-role список вложений (`listCardAttachmentsAllStatusesForServiceRole`), пути `yandex_disk` с дедупом; `ensureBoardYandexDiskAccessToken`; цикл `diskDeleteResource` (`not_found` — ок, прочие ошибки — `console.warn`, удаление карточки не блокируется). `deleteCardAction` в `actions.ts`: вызов до `DELETE cards`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB6.1 | Миграция `20260411231500_ydb6_1_get_board_snapshot_yandex_disk_integration.sql`: `get_board_snapshot` дополнен ключом `yandex_disk_integration` — при отсутствии строки интеграции `null`; иначе объект с `status` для всех с `board.view`, а `yandex_login`, `root_folder_path`, `last_authorized_at`, `last_error_text` только если `boards.owner_user_id = auth.uid()` или `is_system_admin` (без токенов). `npx supabase db push` применён. TS-типы snapshot — в YDB6.3. |
| 2026-04-11 | YDB6.2 | Миграция `20260411233000_ydb6_2_get_board_snapshot_card_ready_attachments.sql`: в `get_board_snapshot` добавлен массив `card_ready_attachments` — только `status = 'ready'`, поля как у UI-списка + `card_id`, JOIN с `cards` по `(id, board_id)`, без `storage_path`. На странице доски snapshot маппится в `BoardCardListItem.readyAttachments`; realtime-merge в `board-columns-dnd` сохраняет поле. Общий тип `CardAttachmentReadyListItem` вынесен в `web/src/lib/card-attachment-ui-types.ts` (клиент + server). `npx supabase db push` и `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB6.3 | `web/src/lib/board-snapshot-types.ts`: `BoardYandexDiskIntegrationStatus`, `BoardYandexDiskIntegrationSnapshot`/`Row`, полный `GetBoardSnapshotResult`, `CardReadyAttachmentSnapshotRow`, `toBoardSnapshotPayload` (единственный узкий cast с RPC). `CardAttachmentListItem` в `card-attachment-ui-types.ts` (каноническое имя YDB6.3), `CardAttachmentReadyListItem` — синоним. `BoardCardListItem.readyAttachments: CardAttachmentListItem[]`. `page.tsx`: убраны локальные типы snapshot, используется `toBoardSnapshotPayload`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB6.4 | Единый контракт для UI: `web/src/app/boards/[boardId]/board-yandex-disk-ui-server-contract.ts` (`"use server"`) — реэкспорт `disconnectBoardYandexDiskIntegrationAction`, `cardAttachmentUploadAction` / `cardAttachmentUploadPrecheckAction`, `deleteCardAttachmentAction`, `listReadyCardAttachmentsAction` + JSDoc-таблица сценариев. `web/src/lib/yandex-disk/yandex-disk-board-ui-endpoints.ts` — `yandexDiskOAuthStartPath`, `cardAttachmentDownloadPath` (подключение/переподключение и скачивание без дублирования путей в компонентах). Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | fix | Пункт «Яндекс.Диск» не показывался: `canViewYandexDiskIntegration = has("board.view")` всегда false — в `get_board_snapshot` право `board.view` не входит в `v_ui_perm_list`, в `allowed_permissions` не отдаётся. На странице доски после успешного RPC доступ к доске уже подразумевает `board.view` → `canViewYandexDiskIntegration = true` в `page.tsx`. |
| 2026-04-11 | YDB7.1 | `web/src/app/boards/[boardId]/board-yandex-disk-button.tsx`: кнопка «Яндекс.Диск» + модалка (как `BoardBackgroundButton`), краткий текст, статус из `snapshot.yandex_disk_integration`, логин/путь/`last_error_text` только при деталях из RPC; владелец/sysadmin — ссылка «Подключить или обновить доступ» на `yandexDiskOAuthStartPath`. `board-settings-menu.tsx`: пункт виден при `board.view` (`canViewYandexDiskIntegration`), временная прямая ссылка OAuth убрана. `page.tsx`: прокидывание `yandex_disk_integration`, `canManageYandexDiskIntegration`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.2 | `web/src/lib/yandex-disk/yandex-disk-integration-modal-presentation.ts`: `getYandexDiskIntegrationModalPresentation` — пять различимых вариантов (`none` / `active` / `reauthorization_required` / `disconnected` / `error`): цветная панель (success/warning/danger/accent dashed vs нейтраль), бейдж с заголовком состояния, публичное описание (строки 15.2 дублируются комментарием для клиента без `server-only`). `board-yandex-disk-button.tsx`: модалка и `title`/`aria-label` кнопки по состоянию. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.3 | Спец. 14.3: для не-владельца `getYandexDiskIntegrationModalPresentation(..., { forIntegrationManager: false })` — только бинарный срез: `status === active` → панель «Подключено» + нейтральный текст без логина/пути; иначе единая панель «Не подключено» + «не подключён или недоступен» (без различия reauth/error/disconnected). Владелец/sysadmin — прежние пять состояний (14.1–14.2). `board-yandex-disk-button.tsx`: опции из `canManageIntegration`; строка «Аккаунт» только при `canManageIntegration`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.4 | `board-yandex-disk-button.tsx`: для `canManageIntegration` — раздельные действия: «Подключить» (нет строки или `disconnected`) → OAuth; «Повторить авторизацию» (`reauthorization_required` / `error`); «Обновить доступ в Яндексе» (`active`) → тот же OAuth; «Отключить» (`active` / `reauthorization_required` / `error`) → `disconnectBoardYandexDiskIntegrationAction`, ошибка в модалке, успех — `router.refresh()` + закрытие. Не-владелец без кнопок управления. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.5 | Продуктово безопасные тексты интеграции: `yandex-disk-product-messages.ts` — константа спец. 15.1 `YANDEX_DISK_MSG_NO_BOARD_YANDEX_CONNECT_PERMISSION`, сообщения для всех `?yandex_disk_oauth=` + `yandexDiskOauthReturnBannerMessage()`; `boards/[boardId]/page.tsx` и `boards/page.tsx` — баннер по флагу (включая `success`, `provider` → `YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE`). `requireBoardYandexDiskIntegrationManagement`: вместо `rpcError.message` → лог + `YANDEX_DISK_MSG_INTEGRATION_PERMISSION_CHECK_FAILED`; `disconnectBoardYandexDiskIntegrationAction` — то же для RPC/неизвестного кода (`YANDEX_DISK_MSG_DISCONNECT_FAILED`). OAuth `start`: ошибка env — 503 с `YANDEX_DISK_MSG_OAUTH_SERVER_MISCONFIGURED` (детали в лог); отказ в праве — редирект с `yandex_disk_oauth=forbidden`. `safeYandexDiskIntegrationLastErrorTextForOwner` в `yandex-disk-integration-modal-presentation.ts` + модалка доски. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | scope-correction | Уточнено требование: entry-point должен идти через `Поля доски` и тип поля `Яндекс диск`, а не через отдельную кнопку/модалку `Яндекс.Диск`. Также на одной доске должно поддерживаться несколько таких полей, поэтому вложения обязаны быть привязаны к `field_definition_id`. Ранее выполненные YDB7.1–YDB7.5 фиксируют промежуточную button-based реализацию и не считаются целевым UI относительно обновлённой спеки. |
| 2026-04-11 | YDB4.7 | Миграция `20260412100000_ydb4_7_card_attachments_field_definition.sql`: CHECK `board_field_definitions.field_type` + `yandex_disk`; колонка `card_attachments.field_definition_id` NOT NULL FK → `board_field_definitions` ON DELETE CASCADE; очистка старых строк вложений; индексы; RLS INSERT/UPDATE с проверкой поля `yandex_disk` на доске карточки; `get_board_snapshot.card_ready_attachments` с `field_definition_id`. TS: `assert-card-yandex-disk-field-definition.ts`; лимит 200 `ready` на пару (карточка, поле); `validateCardAttachmentUploadRequest` / upload / list с `fieldDefinitionId`; `CardAttachmentListItem.field_definition_id`; константа `YANDEX_DISK_MSG_INVALID_YANDEX_DISK_FIELD`. `npx supabase db push`, `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB5.6 | Скачивание и удаление привязаны к `field_definition_id`: `resolveCardAttachmentTemporaryDownloadUrl` и `deleteCardAttachment` принимают `fieldDefinitionId`, SELECT/DELETE с `.eq("field_definition_id", …)`; GET download — обязательный query `field_definition_id`; `cardAttachmentDownloadPath(..., fieldDefinitionId)`; `deleteCardAttachmentAction` — четвёртый аргумент; JSDoc в `board-yandex-disk-ui-server-contract.ts`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB6.5 | Плоский `card_ready_attachments` в RPC без изменений. Тип `CardReadyAttachmentsByFieldId` в `card-attachment-ui-types.ts`; `mapCardReadyAttachmentsRowsByCardId` в `board-snapshot-types.ts` — группировка по карточке и `field_definition_id`. `BoardCardListItem.readyAttachmentsByFieldId` вместо плоского `readyAttachments`; `page.tsx` и realtime-merge в `board-columns-dnd.tsx` обновлены. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.1 (каталог) | Тип `yandex_disk` в каталоге полей: `web/src/app/boards/[boardId]/board-field-types.ts` (`BOARD_FIELD_TYPES`, `BOARD_FIELD_TYPE_OPTIONS`, `isBoardFieldType`); `actions.ts` валидирует тип через импорт; `board-fields-button.tsx` — пункт «Яндекс диск» в списке «Тип». `card-field-drafts.ts`: `BoardCatalogFieldType`, черновик `{ fieldType: "yandex_disk" }`, пропуск в `buildFieldValuesPayload` и обязательности (до YDB8). Заглушки в `create-card-modal.tsx` / `edit-card-modal.tsx`. Миграция `20260412103000_ydb7_1_catalog_yandex_disk_field_rpc.sql`: в `create_card_with_details` и `update_card_body_and_custom_fields` ветка `ELSIF v_ftype = 'yandex_disk'` без записи в `card_field_values`. `npx supabase db push`, `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.2 (контракты) | Серверные контракты под `yandex_disk` без новых миграций: RPC уже из YDB7.1. `actions.ts` — `excludeYandexDiskFieldValuesForRpc`: в `createCardAction` и `updateCardBodyAndCustomFieldsAction` из `p_field_values` убираются записи для полей с `field_type = yandex_disk` (значения только через `card_attachments`). `updateBoardFieldDefinitionAction`: при любой смене типа — проверка `has_board_permission(..., card_fields.manage)`; переход **с** `yandex_disk` на другой тип запрещён, если есть строки `card_attachments` (подсчёт через `getSupabaseServiceRoleClient`); переход **на** `yandex_disk` — service-role `DELETE card_field_values` по `field_definition_id` и удаление `board_field_select_options` пользовательским клиентом. `npx supabase db push` — без изменений; `npx tsc --noEmit` в `web/` — ок. Snapshot `get_board_snapshot` по-прежнему отдаёт `field_type` в определениях полей — отдельной доработки не потребовалось. |
| 2026-04-11 | YDB7.3 | Управление интеграцией перенесено в модалку «Поля доски»: `board-yandex-disk-integration-panel.tsx` (секция «Яндекс.Диск для этой доски», те же состояния/действия, что в бывшей модалке). `board-fields-button.tsx` — пропсы `yandexDiskIntegration`, `canViewYandexDiskIntegration`, `canManageYandexDiskIntegration`; панель при `canView…`. `board-settings-menu.tsx` — пункт «Яндекс.Диск» убран; задержки анимации пунктов меню сдвинуты не требовались (последний блок удалён). Удалён `board-yandex-disk-button.tsx`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.4 | Несколько полей `yandex_disk`: UI «Поля доски» — подсказка при выборе типа, пояснение у строки поля в списке, счётчик/текст над панелью интеграции (`yandexDiskFieldCountLabel`). Удаление определения поля: `best-effort-delete-yandex-disk-objects-on-board-field-delete.ts` + вызов из `deleteBoardFieldDefinitionAction` до DELETE (как YDB5.5 для карточки). Одна интеграция по-прежнему в одном сворачиваемом блоке. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB7.5 | Product-safe UI в «Поля доски»: спец. 14.2 — для владельца дата «Последняя успешная авторизация» (`formatYandexDiskLastAuthorizedAtRu`); текст 8.1/15.1 `YANDEX_DISK_UI_OWNER_ONLY_INTEGRATION_MANAGEMENT` в интро/не-владелец; whitelist `last_error_text` расширен всеми строками разд. 15.2 (+ сервис недоступен). При неактивной интеграции и наличии полей «Яндекс диск» — предупреждающий блок `yandexDiskNonActiveIntegrationHint` над сворачиваемой секцией. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.1 | Поля `yandex_disk` в том же блоке «Поля доски» на вкладке «Детали»: сетка как у остальных полей, панель как у `link`; список из `card.readyAttachmentsByFieldId[fieldId]` (имя, размер, автор из `boardMembers`, дата); пусто — «Файлов пока нет.» Без отдельного глобального блока «Файлы»; вкладка «История» не тронута. `create-card-modal`: то же оформление блока, текст про загрузку после создания карточки. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.2 | Спец. 13.3–13.6 (пустое состояние): `board-yandex-disk-integration-context.tsx` + провайдер в `board-canvas.tsx`, данные из `snapshot.yandex_disk_integration`. `yandex-disk-card-field-empty-copy.ts` — тексты пустого состояния и подсказки при неактивной интеграции (дубликат разд. 15.2 для client). `edit-card-modal`: без права редактирования — только «Файлов пока нет.»; редактор + не `active` — то же + причина (нет строки / disconnected / reauth / error); редактор + `active` — пунктирная область + призыв перетащить или нажать «Добавить файлы» (кнопка и DnD — YDB8.4). `create-card-modal`: прежний текст про загрузку после создания + при неактивной интеграции доп. строка-причина; интерактива нет (файлы до создания карточки недоступны). Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.3 | Спец. 13.4: список `ready` по полю — имя, размер, автор, дата; «Скачать» — ссылка на `cardAttachmentDownloadPath(..., f.id)` при `canOpenCardModal` + `integration.status === active`; «Удалить» — `deleteCardAttachmentAction` при `canEditContent` + `active`, `router.refresh()` при успехе, ошибка над блоком «Поля доски». Проп `canDownloadAttachments` в `EditCardModal`, в `board-columns-dnd` из `canOpenCardModal`. Файлы по-прежнему из `readyAttachmentsByFieldId[f.id]`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.4 | Спец. 13.3/13.5: `YandexDiskCardFieldAttachmentsSection` в `edit-card-modal.tsx` — скрытый `input[type=file][multiple]`, кнопка «Добавить файлы», DnD только внутри `role="region"` поля (`onDrop` на зоне поля); индикатор «Загрузка…» при `cardAttachmentUploadAction`; ошибки по полю в блоке; частичный batch — текст по файлам; при загрузке в одном поле остальные поля `yandex_disk` временно отключены; список + зона «добавить ещё» при наличии `ready`. Миграций нет; `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.5 | Поведение при недоступной интеграции доведено в карточке и создании карточки: `board-yandex-disk-integration-context.tsx`/`board-canvas.tsx` теперь прокидывают `canManageIntegration` в клиентский контекст; `yandex-disk-card-field-empty-copy.ts` — `getYandexDiskCardFieldUnavailableCopy()` с product-safe причиной недоступности и owner-only подсказкой для `reauthorization_required`; `edit-card-modal.tsx` показывает причину недоступности поля даже при уже существующих файлах и скрывает интерактив при неактивной интеграции; `create-card-modal.tsx` показывает ту же причину и owner-only next step. `npx tsc --noEmit` в `web/` — ок. |
| 2026-04-11 | YDB8.6 | Аудит запрещённых точек входа по спекам 13.x: `cardAttachmentUploadAction` используется только из `edit-card-modal.tsx`; единственный `input[type=file]` для вложений находится внутри `YandexDiskCardFieldAttachmentsSection`; `onDrop` есть только в зоне конкретного поля внутри открытой карточки; в `create-card-modal.tsx` загрузка до создания карточки отсутствует; UI вложений не содержит rename attachment и preview внутри приложения, только `Скачать`/`Удалить`. Дополнительных кодовых правок не потребовалось. |

### EPIC YDB1 - Подготовить модель данных и миграции
- [x] **YDB1.1 (done)** Спроектировать таблицу привязки Яндекс.Диска к доске
  - поля: `id`, `board_id`, `yandex_account_id`, `yandex_login`, `root_folder_path`, `encrypted_access_token`, `encrypted_refresh_token`, `access_token_expires_at`, `status`, `connected_by_user_id`, `created_at`, `updated_at`, `last_authorized_at`, `last_error_text`;
  - ограничение: не более одной `active` записи на доску;
  - ограничение/индекс: удобный доступ по `board_id`;
  - **DoD**: таблица и индексы покрывают все обязательные поля из раздела 7.1 спецификации.
- [x] **YDB1.2 (done)** Спроектировать таблицу вложений карточек
  - поля: `id`, `board_id`, `card_id`, `field_definition_id`, `storage_provider`, `storage_path`, `original_file_name`, `mime_type`, `size_bytes`, `uploaded_by_user_id`, `uploaded_at`, `status`;
  - `storage_provider` в этой доработке фиксирован на Yandex Disk, но поле всё равно сохраняется как часть продуктового контракта;
  - предусмотреть индексы по `card_id`, `board_id`, `field_definition_id`, `status`;
  - **DoD**: таблица позволяет отдельно хранить `uploading`, `ready`, `failed` и быстро строить список файлов карточки в разрезе конкретного поля `Яндекс диск`.
- [x] **YDB1.3 (done)** Зафиксировать внешние ключи и delete-правила
  - вложения должны каскадно удаляться при удалении карточки или удаляться через серверный сценарий с Яндекс.Диском до cleanup БД;
  - вложения должны ссылаться на существующее `board_field_definitions.id` с типом `yandex_disk`;
  - интеграция доски не должна каскадно физически удалять файлы из Яндекс.Диска при `disconnected`;
  - **DoD**: SQL-структура не противоречит правилам разделов 9.6 и 12.4.
- [x] **YDB1.4 (done)** Добавить RLS/policies или RPC-слой для чтения и мутаций
  - чтение `ready`-вложений должно соответствовать праву просмотра карточки;
  - insert/update/delete интеграции должен быть owner-only;
  - мутации вложений должны быть завязаны на права редактирования/просмотра карточки и на допустимый `field_definition_id` типа `yandex_disk`;
  - **DoD**: прямой client-side обход правил через таблицы невозможен.
- [x] **YDB1.5 (done)** Подготовить миграцию на enum-like CHECK/константы статусов
  - интеграция: `active | reauthorization_required | disconnected | error`;
  - вложения: `uploading | ready | failed`;
  - **DoD**: БД не принимает посторонние статусы (CHECK в YDB1.1/YDB1.2; YDB1.5 — комментарии к ограничениям + запись в журнале миграций).

### EPIC YDB2 - Подготовить серверную инфраструктуру Яндекс.Диска
- [x] **YDB2.1 (done)** Создать server-only конфигурацию интеграции
  - env для OAuth client id / client secret / redirect URI / encryption key;
  - явная валидация env на сервере;
  - **DoD**: отсутствие обязательных env даёт понятную ошибку на сервере, а не тихую поломку.
- [x] **YDB2.2 (done)** Создать crypto helper для шифрования токенов
  - `encryptSecret(...)` / `decryptSecret(...)`;
  - формат хранения должен быть стабильным и версионируемым;
  - helper должен использовать только server-side API;
  - **DoD**: access/refresh token нигде не сохраняются в открытом виде.
- [x] **YDB2.3 (done)** Создать модуль клиента Яндекс.Диска
  - обмен auth code на токены;
  - refresh access token;
  - получение информации об аккаунте;
  - проверка/создание папок;
  - получение upload URL;
  - получение download URL;
  - удаление файла;
  - проверка существования ресурса;
  - **DoD**: весь Yandex API инкапсулирован в одном серверном слое с нормализованными ошибками.
- [x] **YDB2.4 (done)** Нормализовать маппинг ошибок провайдера
  - отдельно обработать: invalid token, revoked refresh token, missing file, create folder failure, upload failure, download failure, delete failure;
  - маппить в фиксированные сообщения спецификации там, где текст жёстко задан;
  - **DoD**: UI не зависит от сырых текстов Yandex API.

### EPIC YDB3 - Реализовать жизненный цикл интеграции доски
- [x] **YDB3.1 (done)** Подготовить owner-only server-side проверку управления интеграцией
  - источник истины: `boards.owner_user_id = current_user`;
  - не смешивать это правило с board roles;
  - **DoD**: администратор доски без владения не может подключать/переподключать/отключать интеграцию.
- [x] **YDB3.2 (done)** Реализовать start OAuth flow для конкретной доски
  - вход только из настроек конкретной доски, в контексте `Поля доски`;
  - state должен быть привязан к `boardId` и защищён от подмены;
  - **DoD**: можно безопасно начать подключение к конкретной доске.
- [x] **YDB3.3 (done)** Реализовать OAuth callback и первичную запись интеграции
  - обменять код на токены;
  - получить данные аккаунта Яндекса;
  - создать или обновить существующую запись интеграции;
  - создать структуру `/doit/`, `/doit/boards/`, `/doit/boards/<boardId>/`, `/doit/boards/<boardId>/cards/`;
  - **DoD**: после первого успешного подключения у доски есть `active`-интеграция и готовая папочная структура.
- [x] **YDB3.4 (done)** Реализовать сценарий повторного подключения без создания второй активной записи
  - при уже существующей активной интеграции обновлять токены текущей записи;
  - не создавать новый `active` row;
  - **DoD**: инвариант "одна активная интеграция на доску" соблюдается.
- [x] **YDB3.5 (done)** Реализовать запрет смены аккаунта при наличии ready-вложений
  - проверять наличие хотя бы одного готового вложения по доске;
  - возвращать точный текст: `Нельзя сменить Яндекс.Диск для доски, пока в карточках есть файлы.`
  - **DoD**: переподключение к другому аккаунту блокируется, если на доске уже есть готовые файлы.
- [x] **YDB3.6 (done)** Реализовать отключение интеграции
  - менять статус на `disconnected`;
  - не удалять файлы из Яндекс.Диска;
  - не удалять записи вложений автоматически;
  - **DoD**: после disconnect новые загрузки/скачивания запрещены, но данные не теряются.
- [x] **YDB3.7 (done)** Реализовать refresh token flow и перевод в `reauthorization_required`
  - перед сетевой операцией пробовать refresh access token;
  - при инвалидном refresh token переводить интеграцию в `reauthorization_required`;
  - сохранять `last_error_text`;
  - **DoD**: приложение умеет автоматически обновлять access token и корректно деградирует при окончательной потере авторизации.

### EPIC YDB4 - Реализовать server-side операции вложений карточек
- [x] **YDB4.1 (done)** Определить серверный контракт загрузки файлов карточки
  - вход: `boardId`, `cardId`, список `File`;
  - валидации: авторизация, право редактирования карточки, активность интеграции, лимиты количества/размера, непустой файл;
  - **DoD**: есть единая серверная точка входа для upload-flow.
- [x] **YDB4.2 (done)** Реализовать pre-upload валидации по спецификации
  - максимум 20 файлов за операцию;
  - максимум 200 `ready`-вложений на карточку;
  - максимум 50 МБ на файл;
  - пустой файл запрещён;
  - **DoD**: все фиксированные ограничения покрыты до обращения к Яндексу. *(Реализовано в `validate-card-attachment-upload-request.ts` в рамках YDB4.1; см. журнал YDB4.2.)*
- [x] **YDB4.3 (done)** Реализовать создание подпапки карточки перед первой загрузкой
  - путь `/doit/boards/<boardId>/cards/<cardId>/`;
  - создавать только если её ещё нет;
  - **DoD**: первая успешная загрузка в карточку гарантированно происходит в правильную папку.
- [x] **YDB4.4 (done)** Реализовать per-file upload pipeline
  - создать запись вложения со статусом `uploading`;
  - определить extension;
  - собрать путь `<attachmentId><extension>`;
  - запросить upload URL;
  - загрузить файл;
  - перевести запись в `ready` после подтверждённого успеха;
  - переводить запись в `failed` при любой ошибке после создания записи;
  - **DoD**: порядок шагов совпадает с разделом 10.4 спецификации.
- [x] **YDB4.5 (done)** Реализовать частичный успех batch-загрузки
  - успешные файлы сохраняются;
  - неуспешные не попадают в список готовых;
  - UI получает отдельную ошибку по каждому проваленному файлу;
  - **DoD**: batch upload не откатывает успешные файлы из-за соседних ошибок.
- [x] **YDB4.6 (done)** Реализовать получение списка вложений карточки
  - в UI отдавать только `ready`;
  - для internal/admin cleanup при необходимости иметь отдельный серверный доступ ко всем статусам;
  - **DoD**: `uploading` и `failed` не попадают в постоянный список файлов карточки.
- [x] **YDB4.7 (done)** Привязать upload/list контракты к конкретному полю `Яндекс диск`
  - `precheck`, upload action и list action должны принимать `field_definition_id`;
  - сервер обязан проверить, что поле принадлежит доске, доступно в карточке и имеет тип `yandex_disk`;
  - **DoD**: загрузка и выдача списка файлов работают в разрезе конкретного файлового поля, а не карточки целиком.

### EPIC YDB5 - Реализовать скачивание и удаление файлов
- [x] **YDB5.1 (done)** Реализовать server-side скачивание через временный URL
  - проверять авторизацию и право просмотра карточки;
  - проверять доступность интеграции;
  - получать у Яндекса временный URL;
  - не сохранять и не показывать пользователю постоянную ссылку;
  - **DoD**: скачивание идёт только через приложение и не раскрывает постоянный URL.
- [x] **YDB5.2 (done)** Ограничить время жизни прикладного доступа к скачиванию
  - приложение не должно кэшировать download URL дольше 5 минут;
  - предпочтительно вообще не кэшировать между запросами UI;
  - **DoD**: правило раздела 11.3 соблюдено.
- [x] **YDB5.3 (done)** Реализовать сценарий "файл есть в БД, но отсутствует у провайдера"
  - скачивание возвращает `Файл не найден в Яндекс.Диске.`;
  - запись вложения не удаляется автоматически;
  - **DoD**: поведение строго соответствует разделу 11.4.
- [x] **YDB5.4 (done)** Реализовать удаление одного вложения карточки
  - проверять право редактирования карточки;
  - удалять файл из Яндекс.Диска;
  - затем удалять запись из БД;
  - если файла у провайдера уже нет, всё равно удалять запись и считать операцию успешной очисткой;
  - **DoD**: delete-flow соответствует разделу 12.2 и 12.3.
- [x] **YDB5.5 (done)** Реализовать удаление вложений при удалении карточки
  - до/во время удаления карточки пройти по её вложениям;
  - попытаться очистить файлы в Яндекс.Диске;
  - при отсутствии части файлов у провайдера не валить удаление карточки;
  - **DoD**: удаление карточки убирает записи вложений и пытается очистить provider-side ресурсы без ложных фейлов.
- [x] **YDB5.6 (done)** Довести download/delete до модели нескольких файловых полей
  - скачивание и удаление должны сохранять привязку attachment ↔ `field_definition_id`;
  - UI и server-side контракты не должны позволять смешать или подменить файлы соседнего поля;
  - **DoD**: download/delete корректно работают для нескольких полей `Яндекс диск` в одной карточке.

### EPIC YDB6 - Подготовить snapshot, типы и серверные контракты для UI
- [x] **YDB6.1 (done)** Расширить `get_board_snapshot` данными интеграции уровня доски
  - добавить безопасный срез состояния интеграции без токенов;
  - вернуть: статус, логин аккаунта, путь корневой папки, дату последней успешной авторизации, last_error_text при необходимости для owner-only UI;
  - **DoD**: SSR может отрисовать раздел интеграции без дополнительных клиентских запросов.
- [x] **YDB6.2 (done)** Расширить snapshot или отдельный серверный loader данными вложений карточек
  - для каждой карточки нужен список `ready`-вложений с привязкой к `field_definition_id`;
  - при необходимости добавить агрегаты/флаги доступности интеграции;
  - **DoD**: `edit-card-modal` получает все нужные данные для рендера нескольких полей типа `Яндекс диск`. *(Группировка по полю — `BoardCardListItem.readyAttachmentsByFieldId`, YDB6.5.)*
- [x] **YDB6.3 (done)** Обновить TS-типы board/card snapshot
  - добавить `BoardYandexDiskIntegrationSnapshot`;
  - добавить `CardAttachmentListItem`;
  - встроить список вложений в `BoardCardListItem` или в сопутствующую структуру так, чтобы UI мог развести несколько файловых полей;
  - **DoD**: UI типизирован без `any` и ad-hoc cast'ов, включая связь attachment ↔ `field_definition_id`.
- [x] **YDB6.4 (done)** Создать server actions / route handlers для UI
  - `connect/reconnect/disconnect`;
  - `upload attachments`;
  - `download attachment`;
  - `delete attachment`;
  - **DoD**: все UI-сценарии вызывают единый server-side контракт. *(Barrel `board-yandex-disk-ui-server-contract.ts` + endpoints `yandex-disk-board-ui-endpoints.ts`; OAuth start и GET download остаются route handlers, см. JSDoc в barrel.)*
- [x] **YDB6.5 (done)** Пересобрать snapshot и клиентские модели вокруг файловых полей
  - данные ready-вложений должны приходить так, чтобы клиент мог быстро сгруппировать их по `field_definition_id`;
  - `BoardCardListItem` и сопутствующие типы не должны предполагать один общий список файлов на карточку;
  - **DoD**: клиент без ad-hoc логики понимает, какие файлы относятся к какому полю `Яндекс диск`.

### EPIC YDB7 - Перенести интеграцию в `Поля доски`
- [x] **YDB7.1 (done)** Добавить тип поля `Яндекс диск` в каталог полей доски
  - обновить `BOARD_FIELD_TYPES`, клиентские union-типы и выпадающий список `Тип` в `BoardFieldsButton`;
  - не ломать существующие типы `text | date | select | link`;
  - **DoD**: в `Поля доски` можно создать/редактировать поле с типом `Яндекс диск`.
- [x] **YDB7.2 (done)** Доработать серверные контракты и snapshot под `field_type = yandex_disk`
  - разрешить новый тип в actions/RPC/валидации;
  - не пытаться хранить значение такого поля в `card_field_values` по тем же правилам, что `text/date/link/select`;
  - **DoD**: сервер корректно различает обычные поля и файловые поля `Яндекс диск`.
- [x] **YDB7.3 (done)** Перенести owner-only управление интеграцией в контекст `Поля доски`
  - подключение/повторная авторизация/отключение должны запускаться из UI поля типа `Яндекс диск` или его настроек;
  - отдельная обязательная кнопка `Яндекс.Диск` в `BoardSettingsMenu` больше не считается целевым решением;
  - **DoD**: весь integration-management соответствует обновлённой точке входа через `Поля доски`.
- [x] **YDB7.4 (done)** Поддержать несколько полей типа `Яндекс диск` на одной доске
  - создание, удаление, сортировка и отображение нескольких таких определений;
  - единая board-level интеграция не должна дублироваться на каждое поле;
  - **DoD**: доска может иметь несколько файловых полей, использующих одну интеграцию Яндекс.Диска.
- [x] **YDB7.5 (done)** Показать product-safe состояния и ошибки интеграции в UI `Поля доски`
  - использовать фиксированные тексты спецификации там, где они заданы;
  - owner видит управляющие действия и детали, не-owner — только безопасный статус доступности;
  - **DoD**: пользователь получает понятное и безопасное сообщение прямо в сценарии `Поля доски`.

### EPIC YDB8 - Реализовать UI файловых полей `Яндекс диск` внутри карточки
- [x] **YDB8.1 (done)** Встроить поля типа `Яндекс диск` в существующий блок пользовательских полей `edit-card-modal`
  - не создавать отдельный глобальный блок `Файлы`, если поле уже живёт в секции пользовательских полей;
  - не ломать вкладки `Детали` и `История`;
  - **DoD**: файловые поля рендерятся на тех же основаниях, что и остальные поля доски.
- [x] **YDB8.2 (done)** Реализовать пустое состояние для каждого файлового поля
  - если файлов нет и загрузка доступна: призыв перетащить или выбрать файлы;
  - если загрузка недоступна: без интерактивных элементов;
  - **DoD**: пустое состояние соответствует разделу 13.3 для каждого поля `Яндекс диск`.
- [x] **YDB8.3 (done)** Реализовать список готовых вложений в разрезе поля
  - показать исходное имя файла, размер, автора, дату загрузки;
  - кнопка `Скачать` только при праве просмотра;
  - кнопка `Удалить` только при праве редактирования содержимого карточки;
  - не смешивать файлы разных `field_definition_id`;
  - **DoD**: элемент списка соответствует разделу 13.4 и привязан к конкретному файловому полю.
- [x] **YDB8.4 (done)** Реализовать upload UI внутри конкретного файлового поля
  - кнопка `Добавить файлы`;
  - drag-and-drop зона только внутри открытой карточки и внутри конкретного поля;
  - локальный индикатор загрузки;
  - **DoD**: новые файлы можно загрузить только из открытой карточки и только в выбранное поле `Яндекс диск`.
- [x] **YDB8.5 (done)** Реализовать поведение при недоступной интеграции
  - поле `Яндекс диск` остаётся видимым;
  - интерактивные действия недоступны;
  - показывается причина недоступности;
  - для owner при `reauthorization_required` должна быть понятная подсказка про повторную авторизацию;
  - **DoD**: UI соответствует разделу 13.6 и 9.7.
- [x] **YDB8.6 (done)** Исключить недопустимые точки входа
  - никакого drag-and-drop на доску, закрытую карточку, колонку или фон;
  - никакого rename attachment;
  - никакого preview внутри приложения;
  - **DoD**: UI не добавляет сценарии, запрещённые спецификацией. *(Проверено аудитом текущего UI: upload/DnD только внутри `edit-card-modal.tsx` и конкретного поля `yandex_disk`; иных entry-point'ов, rename и preview не найдено.)*

### EPIC YDB9 - Реализовать cleanup и консистентность
- [ ] **YDB9.1 (todo)** Подготовить cleanup `failed`-вложений
  - искать записи `failed` старше 24 часов;
  - удалять их из БД;
  - **DoD**: `failed`-мусор автоматически вычищается в заданный SLA.
- [ ] **YDB9.2 (todo)** Подготовить cleanup осиротевших файлов в Яндекс.Диске
  - сканировать папки досок/карточек;
  - искать файлы, для которых нет attachment row;
  - удалять такие файлы не позднее 24 часов после обнаружения;
  - **DoD**: provider-side orphan files не копятся бесконтрольно.
- [ ] **YDB9.3 (todo)** Зафиксировать механизм запуска cleanup
  - cron job / scheduled task / отдельный служебный endpoint;
  - безопасный запуск только на сервере;
  - **DoD**: cleanup можно реально выполнять, а не только описать в коде.
- [ ] **YDB9.4 (todo)** Логировать проблемные случаи cleanup
  - недействительная интеграция;
  - revoked tokens;
  - provider-side API failures;
  - **DoD**: при проблемах cleanup остаётся диагностируемым.

### EPIC YDB10 - Проверка, приёмка и доводка
- [ ] **YDB10.1 (todo)** Прогнать матрицу прав интеграции доски
  - владелец доски;
  - администратор без владения;
  - участник;
  - наблюдатель;
  - **DoD**: только владелец может подключать/переподключать/отключать интеграцию.
- [ ] **YDB10.2 (todo)** Прогнать матрицу прав карточки
  - просмотр без редактирования;
  - редактирование содержимого;
  - отсутствие доступа к карточке;
  - **DoD**: upload/delete/download соответствуют ролям и не смешиваются.
- [ ] **YDB10.3 (todo)** Прогнать сценарии интеграции
  - первое подключение;
  - повторное подключение того же аккаунта;
  - попытка сменить аккаунт без файлов;
  - попытка сменить аккаунт при наличии `ready`-вложений;
  - disconnect;
  - `reauthorization_required`;
  - **DoD**: весь жизненный цикл интеграции соответствует разделу 9.
- [ ] **YDB10.4 (todo)** Прогнать сценарии вложений
  - одиночная загрузка;
  - batch upload;
  - частичный успех;
  - скачивание готового файла;
  - скачивание отсутствующего у провайдера файла;
  - удаление существующего файла;
  - удаление уже отсутствующего у провайдера файла;
  - удаление карточки с вложениями;
  - **DoD**: разделы 10, 11 и 12 покрыты без открытых дефектов.
- [ ] **YDB10.5 (todo)** Проверить отсутствие регрессий несвязанных частей карточки
  - описание;
  - пользовательские поля;
  - комментарии;
  - удаление карточки;
  - **DoD**: раздел 17 спецификации соблюдён.
- [ ] **YDB10.6 (todo)** Прогнать техническую проверку
  - `lint`;
  - `typecheck`;
  - при наличии e2e/integration-тестов добавить только целевые тесты на file-flow и integration states;
  - **DoD**: изменения не вносят новых очевидных ошибок сборки.

## 5) Рекомендуемый порядок исполнения агентом
1. Закрыть `YDB1.*`.
2. Затем закрыть `YDB2.*`.
3. После этого реализовать `YDB3.*`.
4. Затем собрать файловые операции в `YDB4.*` и `YDB5.*`.
5. После этого расширить данные/UI через `YDB6.*`, `YDB7.*`, `YDB8.*`.
6. В конце завершить `YDB9.*` и `YDB10.*`.

## 6) Карта зависимостей
- `YDB1` обязателен до всех остальных эпиков.
- `YDB2` обязателен до production-ready `YDB3`, `YDB4`, `YDB5`, `YDB9`.
- `YDB3` обязателен до production-ready `YDB4`, `YDB5`, `YDB7`, `YDB8`.
- `YDB4` обязателен до полной готовности `YDB8`.
- `YDB5` обязателен до полной готовности `YDB8`.
- `YDB6` обязателен до SSR/UI-ready `YDB7` и `YDB8`.
- `YDB9` зависит от `YDB1`, `YDB2`, `YDB3`, `YDB4`, `YDB5`.
- `YDB10` завершает все эпики и не должен считаться закрытым до стабилизации cleanup и прав.

## 7) Контрольные риски
- Риск: токены будут храниться в открытом виде или логироваться.
  - Контроль: ввести server-only crypto helper и проверить все точки логирования/ошибок.
- Риск: owner-only правило случайно будет реализовано через board role permissions.
  - Контроль: завязать управление интеграцией именно на `boards.owner_user_id`.
- Риск: UI начнёт показывать `uploading`/`failed` как обычные вложения.
  - Контроль: список карточки строить только по `ready`.
- Риск: файлы нескольких полей `Яндекс диск` на одной карточке будут смешаны в один список.
  - Контроль: хранить и прокидывать `field_definition_id` во всех server-side и UI-контрактах.
- Риск: disconnect случайно удалит файлы провайдера.
  - Контроль: физическое удаление файлов не выполнять при отключении интеграции.
- Риск: download URL будет где-то кэшироваться или оставаться в интерфейсе.
  - Контроль: выдавать его только на скачивание и не сохранять как постоянную ссылку.
- Риск: upload-flow может зависнуть в `card_attachments.status = 'uploading'`, если провайдер принял файл асинхронно (`202 Accepted`) или финальный UPDATE статуса сорвался из-за RLS/контекста сессии.
  - Контроль: финальные переходы `uploading -> ready|failed` выполнять через доверенный server-side контур (`service_role`) с явной проверкой обновления строки; для recovery предусмотреть служебный reconcile stale-`uploading` по `storage_path` через проверку фактического наличия файла на Яндекс.Диске.
- Риск: удаление карточки оставит мусор в Яндекс.Диске.
  - Контроль: отдельный server-side cleanup flow плюс fallback cleanup-job.
- Риск: проекту не хватит инфраструктуры для cron/scheduled tasks.
  - Контроль: если в процессе выяснится отсутствие механизма планировщика, агент должен остановиться и спросить пользователя перед выбором способа запуска cleanup.
- Риск: в процессе реализации выяснится, что OAuth-приложение Яндекса ещё не зарегистрировано или неизвестны redirect URI/env names.
  - Контроль: агент должен остановиться и спросить пользователя до реальной реализации OAuth callback и env wiring.

## 8) Определение готовности
Задача считается завершённой, когда одновременно выполнено всё ниже:
- у доски может существовать не более одной активной интеграции Яндекс.Диска;
- после подключения создаются папки строго по зафиксированным путям;
- вложения карточек сохраняются строго в подпапках своих карточек;
- исходное имя файла не попадает в путь Яндекс.Диска;
- загрузка, скачивание и удаление работают только через приложение и только по правам карточки;
- owner-only управление интеграцией соблюдается на сервере;
- в `Поля доски` появился тип `Яндекс диск` и корректный UI управления интеграцией;
- в карточке появились файловые поля `Яндекс диск` с корректными состояниями и разделением по полям;
- `failed`-вложения и orphan-файлы очищаются служебным сценарием;
- соблюдены все критерии приёмки из раздела 19 спецификации без открытых дефектов.

## 9) Журнал доработок после основного плана

| Дата | Что сделано |
|------|-------------|
| 2026-04-11 | **Регрессия UI вложений:** файл попадал на Яндекс.Диск и в БД (`ready`), но в открытой карточке список оставался пустым. Причина: список строится из `card.readyAttachmentsByFieldId` (снимок + локальный state `BoardColumnsDnD`); одного `router.refresh()` недостаточно, если RSC отдаёт устаревший `get_board_snapshot` до инвалидации кэша; дополнительно ранее помогал только merge вложений при несовпадении порядка карточек после DnD. **Исправление:** после успешной загрузки и после успешного удаления вызывается `listReadyCardAttachmentsAction`, результат записывается в локальный `cardsById` через колбэк `onYandexFieldReadyAttachmentsSynced` (`edit-card-modal.tsx` → `board-columns-dnd.tsx`). |
| 2026-04-11 | **Регрессия upload status:** файл физически попадал на Яндекс.Диск, но запись `card_attachments` иногда оставалась в `uploading`, поэтому карточка его не показывала. Причина: финальный переход статуса выполнялся пользовательским клиентом под RLS/сессионным контекстом и мог тихо не завершиться; дополнительно Яндекс может принять файл асинхронно. **Исправление:** в `card-attachment-upload-pipeline.ts` принят `202 Accepted`, recovery после `network_error` проверяет наличие файла на Диске, а переходы `uploading -> ready|failed` переведены на `service_role` с явной проверкой обновления строки. **На будущее:** держать reconcile stale-`uploading` как служебный сценарий cleanup по `storage_path`. |
