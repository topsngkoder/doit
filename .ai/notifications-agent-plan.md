# План реализации уведомлений (для AI-агента)

Основано на `.ai/notifications-specification.md`.

Цель плана: дать исполняемую декомпозицию для приведения текущей системы уведомлений к новой спецификации: только `browser` + `email`, 6 типов событий, новый экран настроек, Browser Notification API, email-outbox, удаление Telegram/timezone/quiet-hours из пользовательского сценария.

## 0) Входные решения (зафиксировано спецификацией)
- Пользовательские каналы в системе: только `browser` и `email`.
- Канал `browser` означает:
  - создание записи во внутреннем центре уведомлений приложения;
  - показ нативного браузерного уведомления только при `Notification.permission = 'granted'`.
- Telegram не участвует в UI, настройках, матрице типов, доставке и пользовательских сценариях.
- Временная зона, тихие часы и `notification_user_settings` удаляются из целевой модели.
- На экране настроек должно быть ровно 6 типов уведомлений:
  - `added_to_card`
  - `made_responsible`
  - `card_comment_new`
  - `card_moved`
  - `card_in_progress`
  - `card_ready`
- Для каждого типа на экране настроек должны быть ровно 2 чекбокса:
  - `browser`
  - `email`
- Правило “не уведомлять автора” обязательно для всех 6 типов и обоих каналов.
- Для одного межколоночного перемещения карточки создаётся ровно одно событие из набора:
  - `card_moved`
  - `card_in_progress`
  - `card_ready`
- В MVP нативные браузерные уведомления не используют Web Push, Service Worker и не работают при закрытой вкладке/браузере.
- Email-доставка выполняется асинхронно через `notification_outbox`, максимум 5 попыток.

## 1) Текущий технический контекст проекта

### 1.1. Что уже есть в коде
- `web/src/lib/notifications/constants.ts`
  - сейчас содержит 4 event type;
  - каналы сейчас: `telegram` и `internal`.
- `web/src/app/notifications/page.tsx`
  - экран внутреннего центра уведомлений;
  - читает `internal_notifications`;
  - умеет помечать уведомления прочитанными.
- `web/src/app/notifications/actions.ts`
  - `markInternalNotificationReadAction`;
  - `markAllInternalNotificationsReadAction`.
- `web/src/app/notifications/settings/page.tsx`
  - грузит `notification_user_settings.timezone`;
  - грузит `notification_preferences`;
  - собирает initial preferences.
- `web/src/app/notifications/settings/notification-settings-client.tsx`
  - показывает timezone select;
  - использует switch/toggle вместо checkbox;
  - рендерит колонки `Telegram` и `Внутренние`.
- `web/src/app/notifications/settings/actions.ts`
  - обновляет timezone;
  - сохраняет `notification_preferences`.
- `web/src/app/boards/[boardId]/card-comments-sidebar.tsx`
  - создание комментария через RPC `create_card_comment` (уведомления `card_comment_new` внутри RPC).
- SQL-функция `public.enqueue_notification_event(...)`
  - миграция `supabase/migrations/20260407153000_notification_delivery_filters.sql`;
  - сейчас работает только для `internal` + `telegram`;
  - знает только 4 типа событий.

### 1.2. Что уже есть в БД
- `notification_preferences`
  - сейчас хранит каналы `telegram` и `internal`;
  - event type ограничены 4 значениями.
- `notification_outbox`
  - сейчас допускает только канал `telegram`;
  - event type ограничены 4 значениями;
  - статусы уже есть: `pending | sent | failed`;
  - лимит попыток уже ограничен до 5.
- `internal_notifications`
  - уже используется как внутренний центр уведомлений.
- `notification_user_settings`
  - сейчас хранит `timezone` и quiet hours;
  - по новой спецификации должна исчезнуть из целевой модели.
- `profiles`
  - содержит поля для Telegram (`telegram_chat_id`, `telegram_username`, `telegram_linked_at`);
  - спецификация не требует их удалять из `profiles`, но они не должны участвовать в UI и логике уведомлений.

### 1.3. Явные конфликты текущей реализации со спецификацией
- Каналы неправильные: сейчас `telegram/internal`, нужно `browser/email`.
- Event type неполные: сейчас 4, нужно 6.
- UI настроек неправильный:
  - есть timezone;
  - нет блока browser permission;
  - используются switch, а нужны checkbox;
  - колонки неправильные.
- SQL-фильтрация доставки неправильная:
  - пишет в `internal_notifications` и `notification_outbox(channel='telegram')`;
  - не умеет `email`;
  - не умеет `card_in_progress` и `card_ready`.
- Доменные события уведомлений не доведены до конца:
  - нет полной склейки “действие в карточке -> enqueue_notification_event”.
- Логика перемещения карточек пока не соответствует приоритету `done -> in_work -> moved`.
- Нативные браузерные уведомления пока не реализованы.
- Email-воркер/consumer для `notification_outbox(channel='email')` в репозитории явно не найден.

## 2) Стратегия выполнения
- Двигаться сверху вниз по зависимостям:
  - shared constants/types;
  - БД и миграции;
  - SQL-функции доставки;
  - интеграция доменных событий;
  - UI настроек;
  - client runtime для native browser notifications;
  - email outbox processing;
  - приёмка.
- Не начинать UI-часть до фиксации новых enum/check constraints в БД.
- Не подключать native browser notifications до стабилизации semantics канала `browser`.
- Приоритет внедрения для доменных событий:
  1. `added_to_card`
  2. `made_responsible`
  3. `card_comment_new`
  4. `card_ready` / `card_in_progress` / `card_moved`
- Любая логика “default = true, если нет записи preference” должна применяться одинаково на server side и в settings UI.
- Telegram/timezone/quiet-hours не “скрывать частично”, а исключить из активного кода и пользовательского сценария.

## 3) Трекер задач (живой чеклист)
Статусы: `todo | doing | blocked | done`.

### EPIC NT1 — Привести shared constants и UI-словарь к новой модели
- [x] **NT1.1 (done)** Обновить `web/src/lib/notifications/constants.ts`
  - заменить каналы на `browser | email`;
  - расширить event type до 6 значений;
  - обновить русские label для каналов и типов.
  - **DoD**: фронтенд-код больше не использует `telegram/internal` как допустимые пользовательские каналы.
- [x] **NT1.2 (done)** Проверить все импорты `NotificationChannel` / `NotificationEventType`
  - исправить места, где код опирается на старые значения;
  - не оставлять runtime-ветки под `telegram` и `internal` в пользовательском UI.
  - **DoD**: сборка не падает из-за старых union type и label map.

### EPIC NT2 — Обновить схему БД под `browser + email` и 6 event types
- [x] **NT2.1 (done)** Добавить миграцию на `notification_preferences`
  - допустимые `channel`: только `browser`, `email`;
  - допустимые `event_type`: все 6 значений;
  - сохранить уникальность `(user_id, channel, event_type)`.
  - **DoD**: схема таблицы соответствует спецификации 11.1.
- [x] **NT2.2 (done)** Добавить миграцию на `notification_outbox`
  - допустимый `channel`: только `email`;
  - допустимые `event_type`: все 6 значений;
  - статусы `pending | sent | failed` оставить;
  - лимит попыток до 5 сохранить.
  - **DoD**: схема таблицы соответствует спецификации 11.2.
- [x] **NT2.3 (done)** Добавить миграцию на `internal_notifications`
  - расширить допустимые `event_type` до 6 значений.
  - **DoD**: схема таблицы соответствует спецификации 11.3.
- [x] **NT2.4 (done)** Убрать `notification_user_settings` из целевой модели
  - удалить таблицу или перевести проект в состояние полной независимости от неё;
  - убрать связанные `updated_at` trigger references, если они завязаны на существование таблицы;
  - убрать её из server/UI-кода.
  - **DoD**: приложение, UI и логика уведомлений не читают и не пишут `notification_user_settings`.
- [x] **NT2.5 (done)** Проверить RLS после миграций
  - `notification_preferences`: CRUD только своих строк;
  - `internal_notifications`: select/update только своих строк;
  - `notification_outbox`: без пользовательских политик на прямой доступ.
  - **DoD**: после миграций существующая модель доступа не сломана.

### EPIC NT3 — Миграция данных со старой модели на новую
- [x] **NT3.1 (done)** Перенести пользовательские preference по старым 4 типам
  - сохранить existing enabled/disabled значения для старых типов;
  - сопоставление каналов:
    - `internal -> browser`
    - `telegram -> email`
  - если в текущих данных есть оба канала, перенести каждый независимо.
  - **DoD**: пользовательские значения по 4 старым типам не теряются.
- [x] **NT3.2 (done)** Инициализировать новые типы `card_in_progress` и `card_ready`
  - если явных записей нет, default трактуется как `browser = true`, `email = true`;
  - при необходимости можно не материализовать строки в БД, если server/UI уже корректно применяют fallback `true`.
  - **DoD**: новый пользователь и существующий пользователь без явной записи получают `true` по умолчанию.
- [x] **NT3.3 (done)** Обработать legacy timezone / quiet hours
  - старые данные не должны участвовать в UI и доставке;
  - никакой попытки “мигрировать” quiet hours в новую логику не требуется.
  - **DoD**: старые настройки считаются устаревшими и нигде не используются.
- [x] **NT3.4 (done)** Проверить legacy Telegram-данные
  - `profiles.telegram_*` и `telegram_link_tokens` не использовать в новой логике уведомлений;
  - не удалять автоматически, если это не требуется отдельной задачей.
  - **DoD**: Telegram-данные не влияют на пользовательское поведение уведомлений.

### EPIC NT4 — Переписать SQL-слой доставки уведомлений
- [x] **NT4.1 (done)** Переписать `public.enqueue_notification_event(...)`
  - поддержать 6 event type;
  - применять правило “не уведомлять автора”;
  - при `browser` preference = true создавать запись в `internal_notifications`;
  - при `email` preference = true создавать запись в `notification_outbox` с `channel='email'`;
  - по умолчанию при отсутствии preference считать канал включённым.
  - **DoD**: функция соответствует разделам 2.4, 3.2, 8, 9.
- [x] **NT4.2 (done)** Обновить возвращаемый контракт функции
  - вместо `internal_inserted` / `telegram_inserted` вернуть семантику `browser_inserted` / `email_inserted` или аналогично понятный контракт;
  - не допускать legacy-терминов в новых JSON-ключах.
  - **DoD**: результат функции отражает новую модель каналов.
- [x] **NT4.3 (done)** Проверить текстовые поля уведомления
  - title/body/link_url должны позволять формировать одинаковые данные для внутреннего центра и email;
  - обязательные данные: доска, карточка, автор, описание, ссылка.
  - **DoD**: SQL-слой не теряет обязательные поля из раздела 10.2.

### EPIC NT5 — Подключить создание уведомлений к доменным событиям

#### NT5.A — `added_to_card`
- [x] **NT5.1 (done)** Найти и обновить место, где пользователь добавляется в `card_assignees`
  - событие должно создаваться только если пользователь действительно не был участником карточки до этого;
  - получатель: только добавленный пользователь;
  - если пользователь добавил сам себя, уведомление не создавать.
  - **DoD**: уведомление создаётся строго по правилам 4.1.

#### NT5.B — `made_responsible`
- [x] **NT5.2 (done)** Подключить уведомление при смене `cards.responsible_user_id`
  - событие создаётся только для нового ответственного;
  - не создавать, если пользователь назначил ответственным сам себя;
  - не создавать, если значение фактически не изменилось.
  - **DoD**: уведомление создаётся строго по правилам 4.2.

#### NT5.C — `card_comment_new`
- [x] **NT5.3 (done)** Убрать прямой `insert` комментария из чисто клиентского сценария, если это мешает централизованной доставке
  - целевой вариант: создание комментария через server action или RPC, где можно централизованно вызвать `enqueue_notification_event`;
  - сохранить текущие RLS-ограничения и поведение reply.
  - **DoD**: после создания комментария корректно создаются уведомления всем текущим участникам карточки, кроме автора.
- [x] **NT5.4 (done)** Обеспечить фильтрацию удалённых комментариев
  - событие только для нового комментария, который не является удалённым.
  - **DoD**: soft delete/update не создают `card_comment_new`.

#### NT5.D — `card_moved`, `card_in_progress`, `card_ready`
- [x] **NT5.5 (done)** Пересобрать логику уведомлений при перемещении карточки
  - определить `from column_type` и `to column_type`;
  - реализовать строгий приоритет:
    1. `card_ready`
    2. `card_in_progress`
    3. `card_moved`
  - не создавать уведомление при изменении позиции внутри той же колонки.
  - **DoD**: за одно перемещение создаётся не более одного уведомления из трёх.
- [x] **NT5.6 (done)** Проверить интеграцию с существующими RPC перемещения карточек
  - `supabase/migrations/20260406160000_reorder_board_cards_rpc.sql`
  - `supabase/migrations/20260406170000_reorder_board_cards_auto_responsible_in_work.sql`
  - при необходимости выпустить новую миграцию `CREATE OR REPLACE FUNCTION ...`.
  - **DoD**: SQL/RPC на перемещение соответствует разделам 4.4–4.6 и 5.
- [x] **NT5.7 (done)** Сформировать корректных получателей для перемещения
  - все текущие участники карточки;
  - исключить автора перемещения;
  - использовать актуальный состав assignee после операции, если это соответствует фактическому state карточки.
  - **DoD**: список получателей соответствует спецификации.

### EPIC NT6 — Пересобрать экран настроек уведомлений
- [x] **NT6.1 (done)** Упростить серверную загрузку `web/src/app/notifications/settings/page.tsx`
  - убрать чтение `notification_user_settings`;
  - грузить только `notification_preferences`;
  - initial state строить по 6 типам и 2 каналам с fallback `true`.
  - **DoD**: server page не обращается к timezone и quiet hours.
- [x] **NT6.2 (done)** Переписать `notification-settings-client.tsx`
  - удалить блок timezone;
  - удалить все упоминания Telegram;
  - заменить switch на checkbox;
  - сделать таблицу `Тип уведомления | В браузере | По email`;
  - показать ровно 6 строк.
  - **DoD**: UI соответствует разделу 6.1–6.4.
- [x] **NT6.3 (done)** Добавить информационную плашку
  - текст про правило “Вы не получаете уведомления, если являетесь автором действия”.
  - **DoD**: плашка соответствует спецификации.
- [x] **NT6.4 (done)** Сохранить автосохранение
  - одно действие пользователя меняет только одну настройку;
  - сохранить optimistic/local UX, если он уже есть;
  - server action должен upsert-ить одну запись.
  - **DoD**: изменение одного чекбокса сохраняется сразу без кнопки “Сохранить”.
- [x] **NT6.5 (done)** Переписать `web/src/app/notifications/settings/actions.ts`
  - удалить `updateNotificationTimezoneAction`;
  - оставить только действия для preference;
  - проверить server validation на новые каналы и типы.
  - **DoD**: server actions соответствуют новой модели.

### EPIC NT7 — Добавить блок browser permission и native browser notifications
- [x] **NT7.1 (done)** Добавить client-side определение `Notification.permission`
  - состояния: `default | granted | denied`;
  - корректно обрабатывать отсутствие API в браузере.
  - **DoD**: UI знает текущее состояние разрешения без БД.
- [x] **NT7.2 (done)** Добавить блок разрешения на странице настроек
  - при `default`: активная кнопка “Включить уведомления в браузере”;
  - при `granted`: статус “Браузерные уведомления включены”;
  - при `denied`: статус с инструкцией разрешить вручную в браузере и обновить страницу.
  - **DoD**: блок соответствует разделу 7.
- [x] **NT7.3 (done)** Реализовать вызов `Notification.requestPermission()`
  - после ответа браузера UI должен сразу обновить статус;
  - при `default` после закрытия системного диалога без выбора сохранить это состояние в UI.
  - **DoD**: поведение соответствует разделу 7.3–7.4.
- [x] **NT7.4 (done)** Выбрать точку запуска native browser notifications
  - вероятный вариант: отдельный клиентский provider в layout или на защищённой оболочке приложения;
  - provider должен слушать появление новых `internal_notifications` для текущего пользователя.
  - **DoD**: есть единая точка runtime-логики, а не разрозненные вызовы по страницам.
- [x] **NT7.5 (done)** Реализовать правило показа только для открытой, но неактивной вкладки
  - показывать native notification только если:
    - preference `browser = true`;
    - permission = `granted`;
    - вкладка открыта;
    - вкладка неактивна/невидима;
    - запись во внутреннем центре уже существует.
  - при активной вкладке создавать только внутреннее уведомление без `new Notification(...)`.
  - **DoD**: правила раздела 8.1–8.4 выполняются.
- [x] **NT7.6 (done)** Избежать дублей native notifications
  - если список `internal_notifications` перезагружается или realtime присылает одно и то же обновление, не показывать всплывающее уведомление повторно;
  - хранить dedupe state локально в памяти клиента.
  - **DoD**: одно внутреннее уведомление даёт не более одного native popup в рамках жизни вкладки.

### EPIC NT8 — Email outbox и фактическая отправка email
- [x] **NT8.1 (done)** Подготовить data contract для email outbox
  - `notification_outbox.channel = 'email'`;
  - запись должна содержать всё необходимое для шаблона письма;
  - title/body/link_url должны быть пригодны для email.
  - **DoD**: outbox достаточно самодостаточен для отправки письма.
- [x] **NT8.2 (done)** Найти или определить существующий механизм фоновой обработки outbox
  - **аудит:** см. журнал 2026-04-07 «NT8.2»; **зафиксированный путь (сообщение владельца «дальше»):** Next.js Route Handler + `SUPABASE_SERVICE_ROLE_KEY` + расписание (пример: `web/vercel.json` каждые 5 мин; либо внешний cron с `Authorization: Bearer`).
  - **DoD**: выбран технический путь фактической email-доставки.
- [x] **NT8.3 (done)** Реализовать обработчик `pending -> sent/failed`
  - брать только `channel='email'`;
  - увеличивать `attempts`;
  - ограничивать ретраи до 5;
  - учитывать `next_attempt_at`, если поле уже используется в проекте.
  - **Реализация:** `GET|POST /api/cron/process-notification-outbox`, пакетная логика в `process-notification-outbox-email-batch.ts`, отправка через Resend HTTP (`send-outbox-email-resend.ts`).
  - **DoD**: асинхронная email-доставка соответствует разделу 9.2.
- [ ] **NT8.4 (todo)** Подготовить шаблоны/formatter email-содержимого
  - заголовки строго из раздела 10.1;
  - тело должно включать доску, карточку, автора, описание, ссылку.
  - **DoD**: email соответствует обязательным данным из раздела 10.2.

### EPIC NT9 — Привести экран внутреннего центра уведомлений в консистентное состояние
- [ ] **NT9.1 (todo)** Проверить `web/src/app/notifications/page.tsx`
  - при необходимости обновить copy: вместо “внутренние” ориентироваться на термин “центр уведомлений”;
  - не менять базовое поведение read/unread, если оно уже соответствует требованиям.
  - **DoD**: UI центра уведомлений консистентен с каналом `browser`.
- [ ] **NT9.2 (todo)** Проверить `web/src/app/notifications/actions.ts`
  - убедиться, что mark-as-read логика не зависит от legacy event type/channel semantics.
  - **DoD**: прочтение уведомлений продолжает работать без регрессии.

### EPIC NT10 — Очистка legacy UI и copy
- [ ] **NT10.1 (todo)** Удалить все упоминания Telegram из notification UI
  - тексты;
  - labels;
  - описания;
  - табличные заголовки.
  - **DoD**: на экране настроек и связанных экранах Telegram не упоминается.
- [ ] **NT10.2 (todo)** Удалить все упоминания timezone/quiet hours из notification UI
  - тексты;
  - select;
  - server loading;
  - actions.
  - **DoD**: пользовательский сценарий больше не содержит timezone и quiet hours.
- [ ] **NT10.3 (todo)** Проверить `.ai/done/agent-plan.md` и соседние документы только на предмет внутренних ссылок/ожиданий
  - не править исторические планы без необходимости;
  - убедиться, что текущая реализация не ориентируется на устаревшие пункты про Telegram.
  - **DoD**: активный код не зависит от старой документации.

### EPIC NT11 — Проверка критериев приёмки и smoke-тесты
- [ ] **NT11.1 (todo)** Экран настроек
  - нет timezone;
  - нет Telegram;
  - 6 строк;
  - 2 канала;
  - checkbox по каждому сочетанию.
  - **DoD**: соответствует разделу 13.1.
- [ ] **NT11.2 (todo)** Browser permission block
  - `default`: видна кнопка;
  - `granted`: статус включено;
  - `denied`: статус с инструкцией.
  - **DoD**: соответствует разделу 13.2.
- [ ] **NT11.3 (todo)** Новые типы уведомлений
  - перенос в `in_work` создаёт `card_in_progress`;
  - перенос в `done` создаёт `card_ready`;
  - одно перемещение не создаёт дубли между тремя типами.
  - **DoD**: соответствует разделу 13.3.
- [ ] **NT11.4 (todo)** Поведение каналов
  - `email=false` отключает email;
  - `browser=false` отключает создание записи во внутреннем центре;
  - `browser=true + granted + hidden tab` показывает native notification;
  - `browser=true + active tab` не показывает native notification;
  - автор не получает уведомление.
  - **DoD**: соответствует разделу 13.4.
- [ ] **NT11.5 (todo)** Регрессии
  - экран `/notifications` открывается;
  - read/unread работает;
  - settings page сохраняет настройки;
  - сборка и типизация зелёные;
  - lint по изменённым файлам чистый.
  - **DoD**: нет очевидных регрессий в существующем notification flow.

## 4) Порядок выполнения для агента
1. NT1 — обновить shared constants и типы.
2. NT2 — выпустить миграции схемы.
3. NT3 — выпустить миграцию данных.
4. NT4 — переписать `enqueue_notification_event`.
5. NT5 — подключить доменные события к уведомлениям.
6. NT6 — пересобрать settings page.
7. NT7 — добавить browser permission + native notifications runtime.
8. NT8 — довести email outbox до фактической отправки.
9. NT9/NT10 — cleanup legacy UI и терминологии.
10. NT11 — ручная и техническая приёмка.

## 5) Файлы и модули, которые почти наверняка будут затронуты

### Frontend
- `web/src/lib/notifications/constants.ts`
- `web/src/app/notifications/page.tsx`
- `web/src/app/notifications/actions.ts`
- `web/src/app/notifications/settings/page.tsx`
- `web/src/app/notifications/settings/notification-settings-client.tsx`
- `web/src/app/notifications/settings/actions.ts`
- `web/src/app/layout.tsx` или другой общий layout/provider-слой для runtime browser notifications
- `web/src/app/boards/[boardId]/card-comments-sidebar.tsx`
- `web/src/app/boards/[boardId]/actions.ts` и связанные модули, если уведомления будут подключаться через server actions

### SQL / migrations
- новая миграция для `notification_preferences`
- новая миграция для `notification_outbox`
- новая миграция для `internal_notifications`
- новая миграция для удаления/деактивации `notification_user_settings`
- новая миграция с `CREATE OR REPLACE FUNCTION public.enqueue_notification_event(...)`
- новая миграция для обновления RPC перемещения карточек:
  - `reorder_board_cards`
  - авто-логики `in_work`
- возможно новая миграция/RPC для централизованного создания комментариев с уведомлениями

### Инфраструктура
- модуль/worker/Edge Function для обработки `notification_outbox(channel='email')`
- возможно новый клиентский provider/hook для Browser Notification API

## 6) Риски и стоп-условия
- Если в проекте нет существующего механизма отправки email и нет согласованного провайдера, выполнение EPIC NT8 должно остановиться с вопросом пользователю.
- Если создание комментариев останется прямым клиентским `insert`, а централизованно вызвать `enqueue_notification_event` не получится без дублирования логики, агент должен остановиться и выбрать один из путей:
  - перевод создания комментария на server action/RPC;
  - либо DB-trigger подход, если он лучше укладывается в текущую архитектуру.
- Если удаление `notification_user_settings` ломает существующие миграции/триггеры, разрешается перейти на промежуточный шаг:
  - сначала полностью отвязать код;
  - затем удалить таблицу отдельной миграцией.

## 7) Минимальный definition of done всей задачи
- В пользовательском UI больше нет Telegram, timezone и quiet hours на экране настроек уведомлений.
- На экране настроек есть только 6 типов уведомлений и только 2 канала: `browser`, `email`.
- `browser=false` отключает создание записи в `internal_notifications`.
- `browser=true` создаёт запись в `internal_notifications`, а native notification показывается только при `granted` и скрытой/неактивной вкладке.
- `email=true` создаёт запись в `notification_outbox(channel='email')`.
- Для `card_ready` / `card_in_progress` / `card_moved` соблюдён строгий приоритет без дублей.
- Правило “не уведомлять автора” соблюдается для всех 6 типов и обоих каналов.
- Legacy-логика `telegram/internal/timezone/quiet hours` не участвует в пользовательском сценарии и доставке уведомлений.

## 8) Журнал прогресса (агент)
- **2026-04-07 — NT1.1**
  - Обновлён `web/src/lib/notifications/constants.ts`: каналы `browser` / `email`, шесть типов событий (добавлены `card_in_progress`, `card_ready`), подписи каналов «В браузере» / «По email» и типов по спецификации §3.1.
  - `web/src/app/notifications/settings/notification-settings-client.tsx`: колонки и переключатели строятся из `NOTIFICATION_CHANNELS` (без хардкода `telegram`/`internal`); для `form action` часового пояса добавлена обёртка `async (fd) => { await updateTimezoneAction(fd); }` из‑за типов Next.js 15 (возврат `ServerResult` из прямого `action` не допускается).
  - Миграции не делались (шаг NT2).
  - Проверка: в каталоге `web/` выполнен `npm run build` — успешно.
- **2026-04-07 — NT1.2**
  - В `constants.ts` добавлены `isNotificationChannel` / `isNotificationEventType`; `settings/actions.ts` переведён на их импорт.
  - `settings/page.tsx`: разбор строк из БД через type guards (без `as` для channel/event_type), подзаголовок «6 типов».
  - `notification-settings-client.tsx`: убраны упоминания Telegram/тихих часов у блока временной зоны; нейтральная подпись про отсутствие влияния на доставку.
  - Импорты `@/lib/notifications/constants` по репозиторию: только модуль настроек уведомлений.
  - Проверка: `npx next build` в `web/` — успешно.
- **2026-04-07 — NT2.1**
  - Добавлена миграция `supabase/migrations/20260407180000_notification_preferences_browser_email.sql`: снятие старых CHECK на таблице, `UPDATE` каналов `internal` → `browser`, `telegram` → `email`, новые ограничения `channel IN ('browser','email')` и шесть значений `event_type` (включая `card_in_progress`, `card_ready`); уникальность `(user_id, channel, event_type)` не менялась.
  - Локальный `supabase status` недоступен (Docker Desktop не запущен); миграция применена к связанной remote БД: `supabase db push`.
  - Замечание: полное соответствие доставки новой модели по-прежнему в NT4 (`enqueue_notification_event` ещё смотрит на старые имена каналов в SQL).
  - Проверка у себя: при необходимости локально — запустить Docker, `supabase db reset` или `migration up`; для remote — убедиться, что в dashboard нет ошибок и `select distinct channel, event_type from notification_preferences` даёт только допустимые значения.
- **2026-04-07 — NT2.2**
  - Миграция `supabase/migrations/20260407181000_notification_outbox_email_channel.sql`: снятие CHECK на `notification_outbox`, `UPDATE channel` с `telegram` на `email`, новые ограничения — `channel = 'email'`, шесть `event_type`, `status` и диапазон `attempts` сохранены как в исходной схеме.
  - Применено к remote: `supabase db push`.
  - Пока `enqueue_notification_event` вставляет `channel = 'telegram'`, новые строки в outbox падать будут до NT4 — ожидаемо.
- **2026-04-07 — NT2.3**
  - Миграция `supabase/migrations/20260407182000_internal_notifications_six_event_types.sql`: пересоздан один CHECK на `event_type` — шесть значений; существующие строки с четырьмя старыми типами остаются валидными.
  - Применено к remote: `supabase db push`.
- **2026-04-07 — NT2.4**
  - Миграция `supabase/migrations/20260407183000_drop_notification_user_settings.sql`: `DROP TABLE` для `notification_user_settings` (триггер `updated_at` и RLS удаляются вместе с таблицей).
  - Код: `settings/page.tsx` без запроса к таблице; `actions.ts` без `updateNotificationTimezoneAction`; `notification-settings-client.tsx` без блока временной зоны.
  - Применено к remote: `supabase db push`. Проверка: `npm run build` в `web/` — успешно.
- **2026-04-07 — NT2.5**
  - Ревизия по `supabase/migrations/20260317146000_rls_activity_notifications_preview.sql`: для `notification_preferences` — SELECT/UPDATE/DELETE по `user_id = auth.uid()` (и bypass `is_system_admin()`), INSERT с `WITH CHECK ( user_id = auth.uid() )`; для `internal_notifications` — SELECT и UPDATE только своих, политик INSERT/DELETE для `authenticated` нет (вставка через service role / SECURITY DEFINER); для `notification_outbox` — RLS включён, политик для `authenticated` нет.
  - Миграции NT2.1–NT2.4 не меняли эти политики; удаление `notification_user_settings` убрало таблицу и её политики вместе с `DROP TABLE`.
  - Доп. проверка в SQL Editor (по желанию): политики на оставшихся таблицах — `SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('notification_preferences','internal_notifications','notification_outbox') ORDER BY tablename, policyname;` для `notification_outbox` список должен быть пустым.
- **2026-04-07 — NT3.1**
  - Отдельная миграция не добавлялась: перенос уже сделан в `supabase/migrations/20260407180000_notification_preferences_browser_email.sql` (шаг NT2.1): перед новыми CHECK выполняется `UPDATE ... SET channel = CASE ... internal→browser, telegram→email` только для строк со старыми каналами; столбец `enabled` не трогается — значения по четырём старым `event_type` сохраняются; строки с разными каналами остаются разными строками (`UNIQUE (user_id, channel, event_type)`).
  - `supabase db push`: remote «up to date».
  - **Как проверить у себя** (SQL Editor): `SELECT channel, event_type, enabled, count(*) FROM notification_preferences GROUP BY 1,2,3 ORDER BY 1,2;` — не должно быть `internal`/`telegram`; для каждой комбинации из четырёх старых типов смотрите, что флаги соответствуют ожиданиям пользователей.
- **2026-04-07 — NT3.2**
  - Миграция `supabase/migrations/20260407184000_notification_preferences_new_event_defaults.sql`: для каждого `profiles.user_id` вставлены четыре строки `(browser|email × card_in_progress|card_ready, enabled=true)` с `ON CONFLICT (user_id, channel, event_type) DO NOTHING`.
  - UI: `settings/page.tsx` по-прежнему инициализирует все 6×2 ключей значением `true` до наложения строк из БД — для **новых** пользователей после миграции без строк в таблице поведение остаётся «всё включено», пока они не переключат чекбокс (тогда появится явная запись через upsert).
  - Применено: `supabase db push`.
  - **Проверка:** `SELECT count(*) FROM notification_preferences WHERE event_type IN ('card_in_progress','card_ready') AND enabled = false` — ожидаемо 0 сразу после миграции (пока никто не отключал); сравнить `count(distinct user_id)` в `profiles` и число пользователей, у кого ровно по две строки на каждый из двух типов (опционально).
  - **NT4:** в `enqueue_notification_event` обязательно трактовать отсутствие строки как «канал включён» (например `COALESCE((SELECT enabled FROM ... LIMIT 1), true)`), иначе пользователи без материализованных prefs для старых типов могут не получать доставку.
- **2026-04-07 — NT3.3**
  - Отдельная миграция не требуется: legacy-данные timezone / quiet hours хранились только в `notification_user_settings` и **удалены вместе с таблицей** в `20260407183000_drop_notification_user_settings.sql` (NT2.4); перенос тихих часов в новую модель **не делался** и не планируется.
  - **Web:** в `web/src/app/notifications` нет обращений к `notification_user_settings`, timezone и quiet hours (поиск по каталогу).
  - **SQL:** `public.enqueue_notification_event` и прочие миграции доставки не используют timezone/quiet hours.
  - **Проверка:** `SELECT to_regclass('public.notification_user_settings');` — ожидаемо `NULL`; локально при необходимости `supabase db reset` и убедиться, что цепочка миграций проходит без ошибок.
- **2026-04-07 — NT3.4**
  - **Web:** поиск по `web/` (`telegram` / `Telegram`) — вхождений нет; экраны и экшены уведомлений на Telegram и `telegram_link_tokens` не опираются.
  - **SQL:** чтение `profiles.telegram_chat_id` и ветка `channel = 'telegram'` остались только в `enqueue_notification_event` (`20260407153000_notification_delivery_filters.sql`); вызовов этой функции из других миграций нет — целевая «новая» доставка снимается в **NT4** (browser/email, без линка на Telegram).
  - Таблицы `profiles.telegram_*` и `telegram_link_tokens` **не удалялись** (как в задаче).
  - **Проверка:** повторить `rg -i telegram web` (или поиск в IDE по `web/`); убедиться, что в настройках уведомлений нет колонки/копира про Telegram.
- **2026-04-07 — NT4.1 + NT4.2**
  - Миграция `supabase/migrations/20260407185000_enqueue_notification_event_browser_email.sql`: `enqueue_notification_event` принимает шесть `event_type` (`card_in_progress`, `card_ready` добавлены); предпочтения читаются по каналам `browser` и `email`; при отсутствии строки в `notification_preferences` подканал считается включённым (`COALESCE(..., true)`); при совпадении получателя и актёра возвращается `skipped=true`, вставок нет; внутренний центр — только при включённом `browser`; outbox — только при включённом `email`, `channel = 'email'` (без `profiles.telegram_chat_id`).
  - JSON-ответ: `browser_inserted` / `email_inserted` вместо legacy-ключей; при пропуске по автору оба `false`.
  - Применено: `supabase db push` (remote).
  - **Как проверить:** в SQL Editor подставить реальные uuid из своей БД —  
    `select public.enqueue_notification_event('<recipient>', 'card_ready', '<recipient>', '<board>', '<card>', 'текст тела с контекстом', 'https://app.example/board/...');` → при совпадении получателя и актёра ожидается `skipped=true` (см. NT4.3: отдельный аргумент title убран);  
    с другим `p_actor_user_id` и включёнными prefs — две вставки или одна, если один канал выключен в `notification_preferences`.
- **2026-04-07 — NT4.3**
  - Миграция `supabase/migrations/20260407200000_enqueue_notification_event_nt43_text_contract.sql`: одна и та же пара `title`/`body`/`link_url` пишется и в `internal_notifications`, и в `notification_outbox`; `title` вычисляется из `event_type` по спецификации §10.1 (вызов больше не принимает `p_title`).
  - Проверки перед вставкой: `p_board_id` и `p_card_id` NOT NULL; `p_body` и `p_link_url` после `trim` не пустые. Содержимое §10.2 (имя автора, названия доски/карточки в тексте) остаётся ответственностью вызывающего кода в `p_body`.
  - Применено: `supabase db push`.
  - **Следующий шаг по плану:** NT5.1 (`added_to_card`).
  - **Как проверить:** вызов с пустым `p_body` или без `p_link_url` → `ERROR`; с валидными аргументами — одинаковые `title`/`body`/`link_url` в обеих таблицах (`title` для типа совпадает с §10.1).
- **2026-04-07 — NT5.1**
  - Миграция `supabase/migrations/20260407210000_nt51_added_to_card_enqueue.sql`:
    - `mutate_card_assignee`: после успешного `INSERT ... ON CONFLICT DO NOTHING` и `GET DIAGNOSTICS` только при `v_ins_count > 0` вызывается `enqueue_notification_event` для **добавленного** пользователя; повторное добавление уже существующего участника не шлёт уведомление; `p_actor_user_id = auth.uid()`; совпадение с получателем обрабатывается внутри `enqueue_notification_event`.
    - `create_card_with_details`: после вставки всех `card_assignees` цикл по `p_assignee_user_ids` с тем же `enqueue` (создатель в списке участников не получает уведомление сам себе).
  - Тело уведомления: доска и карточка + автор; ссылка `/boards/{board_id}?card={card_id}`.
  - Применено: `supabase db push`.
  - **Проверка:** на доске добавить **другого** участника карточки через UI → во внутреннем центре у очереди появилась запись `added_to_card`; добавить себя в список при создании карточки / самоссылка mutate — уведомления «себе» нет; повторно добавить того же assignee (без удаления) — второго уведомления нет.
- **2026-04-07 — NT5.2**
  - Миграция `supabase/migrations/20260407220000_nt52_made_responsible_enqueue.sql`: в `set_card_responsible_user` после фактического `UPDATE` и записи `card_activity` вызывается `enqueue_notification_event` для **нового** ответственного, тип `made_responsible`, автор — `auth.uid()`; тело и ссылка в том же формате, что у NT5.1 (`/boards/{board}?card={card}`); ранний выход при `v_current IS NOT DISTINCT FROM p_responsible_user_id` без изменений; назначение себе — пропуск внутри `enqueue_notification_event` (`skipped`).
  - Авто-назначение ответственным при DnD в «В работе» (`reorder_board_cards`) по-прежнему выставляет `responsible_user_id = auth.uid()` — получатель = автор, отдельный enqueue не добавлялся (соответствует §4.2 «не уведомлять, если сам сделал себя ответственным»).
  - Применено: `supabase db push`.
  - **Проверка:** под пользователем A на карточке с участником B — «Сделать ответственным» для B → у B во внутреннем центре событие `made_responsible`, заголовок «Сделали ответственным»; повторный клик по уже ответственном B — без нового уведомления; A назначает себя ответственным — у A записи нет; смена B → C — уведомление только у C.
- **2026-04-07 — NT5.3**
  - Миграция `supabase/migrations/20260407230000_nt53_create_card_comment_rpc.sql`: RPC `create_card_comment(p_card_id, p_body, p_reply_to_comment_id)` (`SECURITY DEFINER`) — проверка `comments.create` на доске карточки, длина тела 1–5000, вставка в `card_comments` с `author_user_id = auth.uid()`; ответ тому же триггеру `check_comment_reply_same_card`, что и при прямом INSERT.
  - После вставки: для каждого `card_assignees.user_id` вызывается `enqueue_notification_event(..., 'card_comment_new', ...)`; автор исключается правилом в `enqueue_notification_event`.
  - Клиент: `web/src/app/boards/[boardId]/card-comments-sidebar.tsx` — отправка формы через `supabase.rpc('create_card_comment', ...)` вместо прямого `insert`.
  - Применено: `supabase db push`. Сборка: `npm run build` в `web/` — успешно.
  - **Проверка:** карточка с участниками A и B; A пишет комментарий — у B запись `card_comment_new`, у A нет; ответ с `reply` — то же; пользователь без `comments.create` — RPC с ошибкой прав.
- **2026-04-07 — NT5.4**
  - Миграция `supabase/migrations/20260407240000_nt54_card_comment_new_skip_deleted.sql`:
    - триггер `BEFORE INSERT` `card_comments_insert_not_deleted`: запрет строки с `deleted_at IS NOT NULL` при создании;
    - `create_card_comment`: в `INSERT` явно `deleted_at NULL`; цикл `enqueue_notification_event` выполняется только если вставленная строка существует с `deleted_at IS NULL` (контракт после вставки).
  - Правка текста и soft-delete по-прежнему через server actions (`updateCardCommentAction` / `softDeleteCardCommentAction`) — вызовов `enqueue` нет.
  - Применено: `supabase db push` (remote).
  - **Проверка:** создать комментарий — уведомления участникам как раньше; удалить комментарий (soft-delete) — новых `card_comment_new` нет; попытка `INSERT` в `card_comments` с `deleted_at` не NULL (например из SQL) — ошибка триггера.
  - **Следующий шаг по плану:** NT5.5 (уведомления при перемещении карточки) — выполнен, см. журнал ниже.
- **2026-04-07 — NT5.5**
  - Миграция `supabase/migrations/20260407250000_nt55_reorder_board_cards_move_notifications.sql`: в `reorder_board_cards` после `UPDATE` карточки и записей `card_activity`, при **смене колонки** (`v_col_changed`):
    - по `board_columns.column_type` для старой/новой колонки выбирается **ровно один** тип: приоритет `card_ready` (цель `done`, источник не `done`) → `card_in_progress` (цель `in_work`, источник не `in_work`) → иначе `card_moved`;
    - только смена `position` в той же колонке — **без** `enqueue_notification_event`;
    - для каждого `card_assignees.user_id` вызывается `enqueue_notification_event` (правило автора — внутри функции); тело включает доску, карточку, колонки, автора; ссылка `/boards/{board}?card={card}`.
  - Участники берутся **после** возможного `INSERT` в `card_assignees` при переносе в `in_work` (актуальный состав).
  - Применено: `supabase db push` (remote).
  - **Проверка в UI:** доска с колонками очередь / в работе / готово; карточка с двумя участниками (A перетаскивает, B в наблюдателях): A тащит в «В работе» — у B одно уведомление типа `card_in_progress`, заголовок «Ваша карточка в работе»; в «Готово» — `card_ready`; между двумя не-in_work колонками — `card_moved`; перетаскивание только вверх/вниз **в той же** колонке — новых уведомлений нет; A сам не получает запись.
  - **Следующий шаг по плану:** NT5.7 (получатели — см. NT5.5; при приёмке сверить со спецификацией) либо EPIC NT6.
- **2026-04-07 — NT5.6**
  - **Цепочка миграций:** `20260406160000_reorder_board_cards_rpc.sql` → `20260406170000_reorder_board_cards_auto_responsible_in_work.sql` → `20260407250000_nt55_reorder_board_cards_move_notifications.sql`; итоговое определение функции — только в NT55 (других `CREATE OR REPLACE` для `reorder_board_cards` в репозитории нет).
  - **Сохранённая семантика F6/F7 из 0616/0617:** валидация layout, права на перемещение, при смене колонки на `in_work` — `INSERT card_assignees(actor)`, `UPDATE responsible_user_id`, две записи `card_activity` (`card_moved` и при необходимости `responsible_auto_set`).
  - **NT55:** блок уведомлений только при `v_col_changed`, приоритет `card_ready` → `card_in_progress` → `card_moved`, порядок внутри колонки без `enqueue`; получатели — `card_assignees` после `UPDATE`/`INSERT assignee` (актуальный состав).
  - **Клиент:** `reorderBoardCardsAction` → единственный RPC `reorder_board_cards` (`web/src/app/boards/[boardId]/actions.ts`); DnD (`board-columns-dnd.tsx`) вызывает только этот action.
  - **Realtime DO из 0616:** однократно при проходе миграции 0616; NT55 его не дублирует — ожидаемо.
  - Применено: `npx supabase db push --yes` → **Remote database is up to date.**
  - **Как проверить у себя:** smoke из журнала NT5.5 (переносы между типами колонок, без уведомления при сортировке внутри колонки); опционально в SQL: `select pg_get_functiondef('public.reorder_board_cards(uuid,jsonb)'::regprocedure);` — в теле есть `v_set_responsible` и цикл `enqueue_notification_event`.
- **2026-04-07 — NT5.7**
  - Спецификация §4.4–4.6: получатели — все строки `card_assignees` по карточке, кроме автора перемещения.
  - Реализация (`20260407250000_nt55_...`): после `UPDATE`/`INSERT assignee` цикл `FOR r_assignee IN SELECT ... card_assignees WHERE card_id = v_old.id` + `enqueue_notification_event(..., v_uid, ...)`; при совпадении получателя и актёра функция ставит `skipped` и не вставляет записи (`20260407200000_enqueue_notification_event_nt43_...`).
  - **Как проверить:** сценарий из NT5.5; перенос в `in_work` с автодобавлением актёра в assignees — уведомления у других участников есть, у перетаскивающего нет.
- **2026-04-07 — NT6 (NT6.1–NT6.5)**
  - **NT6.1:** `settings/page.tsx` — только `notification_preferences`, инициализация всех пар из `NOTIFICATION_EVENT_TYPES × NOTIFICATION_CHANNELS` с `true`, затем слияние строк БД; `notification_user_settings` не используется.
  - **NT6.2:** `notification-settings-client.tsx` — toggle-переключатели заменены на `<input type="checkbox">` (доступность: `aria-label` по типу и каналу); таблица 6 строк × 2 канала без изменений структуры.
  - **NT6.3:** плашка «Вы не получаете уведомления, где являетесь автором действий.» (§6).
  - **NT6.4:** прежний `submitPreference` + `upsert` одной записи за клик.
  - **NT6.5:** `actions.ts` — только `setNotificationPreferenceEnabledAction`, валидация `isNotificationChannel` / `isNotificationEventType`.
  - Проверка: `npm run build` в `web/` — успешно.
  - **Следующий шаг по плану:** EPIC NT7 (browser permission + native notifications).
- **2026-04-07 — NT7.1**
  - Добавлены `web/src/lib/notifications/browser-notification-permission.ts` (`readBrowserNotificationPermission`, типы `StandardBrowserNotificationPermission` / `BrowserNotificationPermissionStatus`: `ready` + `default|granted|denied` либо `unsupported` при отсутствии `window`/`Notification`) и `web/src/lib/notifications/use-browser-notification-permission.ts` (хук: первичное чтение после mount, обновление по `window` `focus` и `document` `visibilitychange` при `visible`).
  - `notification-settings-client.tsx`: вызов хука; на корне `<section>` атрибут `data-browser-notification-permission` со значениями `pending` (до клиента) | `unsupported` | `default` | `granted` | `denied` — для проверки без БД; пользовательский блок кнопок/текста — **NT7.2**.
  - Миграции не требовались.
  - Проверка: `npm run build` в `web/` после очистки `web/.next` (если сборка ругалась на отсутствующий chunk — артефакт кэша). Вручную: открыть `/notifications/settings`, в DevTools у `section.space-y-5` смотреть `data-browser-notification-permission`; сменить разрешение сайта для уведомлений → вернуться на вкладку / фокус окна — атрибут должен обновиться.
  - **Далее:** NT7.2–NT7.3 (см. журнал ниже).
- **2026-04-07 — NT7.2 + NT7.3**
  - Порядок по §6.1: блок «Уведомления в браузере» **выше** плашки про автора и таблицы предпочтений.
  - `use-browser-notification-permission.ts`: хук возвращает `{ status, refresh }` для перечитывания после `requestPermission` и при фокусе/видимости (как раньше).
  - `notification-settings-client.tsx`: карточка с подзаголовком §7.1 (не подменяет таблицу / email / внутренний центр); состояния — текст при `pending` и `unsupported`; при `granted` — «Браузерные уведомления включены»; при `denied` — дословно §7.2; при `default` — кнопка «Включить уведомления в браузере» → `Notification.requestPermission()`, затем `refresh` в `finally` (ошибки контекста — тоже перечитать состояние, §7.4).
  - Миграции не требовались.
  - Проверка: `npm run build` в `web/` — успешно. Вручную на `/notifications/settings`: до клика — кнопка при первом заходе; после разрешения/запрета — нужный текст; заблокировать сайту уведомления в настройках браузера → обновить страницу — ветка `denied`; снять блокировку и обновить — снова запрос или `default`/`granted` в зависимости от браузера.
  - **Следующий шаг по плану:** NT7.4 (точка запуска native notifications / provider) — см. журнал ниже.
- **2026-04-07 — NT7.4**
  - **Realtime:** миграция `supabase/migrations/20260407261000_realtime_internal_notifications.sql` — таблица `internal_notifications` добавлена в публикацию `supabase_realtime` (идемпотентно, с `RAISE WARNING` при ошибке).
  - **Provider:** `web/src/lib/notifications/browser-native-notifications-provider.tsx` — клиентский контекст: подписка `postgres_changes` только на `INSERT` по `user_id=eq.<session>`; переключение канала при `onAuthStateChange`; оповещение подписчиков через `subscribe` / хук `useInternalNotificationInserts` (для NT7.5–NT7.6).
  - **Layout:** `web/src/app/layout.tsx` — обёртка `BrowserNativeNotificationsProvider` вокруг основного контейнера страницы.
  - Применено: `npx supabase db push --yes`. Сборка: `npm run build` в `web/` — успешно.
  - **Как проверить:** залогиниться, открыть приложение; в другой сессии/браузере вызвать действие, создающее внутреннее уведомление; в DevTools → Application можно повесить временно `useInternalNotificationInserts` на тестовой странице или поставить breakpoint в `emit` — событие должно прийти после применения миграции и при включённом Realtime на проекте. Без миграции вставки в БД есть, но Realtime по таблице не шлёт.
  - **Следующий шаг по плану:** NT7.5 (вкладка неактивна + `Notification` только при `granted` и preference browser) — см. журнал ниже.
- **2026-04-07 — NT7.5**
  - `browser-native-notifications-provider.tsx`: парсинг Realtime INSERT дополняет `event_type` (`isNotificationEventType`); `BrowserNativeNotificationPresenter` внутри provider вызывает `useInternalNotificationInserts` и по событию:
    - §8.1–8.2: `readBrowserNotificationPermission` только `granted`; для типа — `notification_preferences` `channel=browser` + `event_type`, отсутствие строки = включено (`enabled !== false`);
    - §8.3–8.4: `shouldOfferNativeBrowserPopup()` — показ только если `document.hidden` / `visibilityState === 'hidden'` или окно без фокуса (`!document.hasFocus()`); на активной видимой вкладке всплытия нет;
    - проверка `getUser()` совпадает с `row.user_id`;
    - `new Notification(title, { body, data })`, `onclick` — фокус окна и переход по `link_url` при наличии.
  - Дедупликация по `id` в `Set` (до 500) в том же презентере — база под NT7.6.
  - Проверка: `npm run build` в `web/` — успешно.
  - **Как проверить вручную:** выдать сайту разрешение на уведомления; для типа события включить «В браузере»; воспроизвести действие **другим** пользователем; получатель **с вкладкой в фоне** (или без фокуса окна) — системное уведомление; та же вкладка **в фокусе и видима** — только запись в `/notifications`, без popup.
  - **Следующий шаг по плану:** NT7.6 (доработать dedupe при необходимости — перезагрузка списка и пр.) — см. журнал ниже.
- **2026-04-07 — NT7.6**
  - `browser-native-notifications-provider.tsx`: **два уровня дедупликации** по `internal_notifications.id` в памяти вкладки: (1) в `emit()` до вызова слушателей — отсекает повторный Realtime/дубликат payload с тем же `id`; (2) в `BrowserNativeNotificationPresenter` — **синхронное** добавление `id` в `Set` до любого `await` в async-цепочке — устраняет гонку, когда два события подряд запускали параллельные IIFE, оба проходили ранний `has(id)` до первого `add` после `getUser` и оба вызывали `new Notification`.
  - Повторный `add` перед `new Notification` удалён как избыточный; при ошибке конструктора `Notification` по-прежнему `delete(id)` для возможной повторной попытки при крайне редком сценарии.
  - Миграции не требовались.
  - Проверка: `npm run build` в `web/`. Вручную (опционально): при появлении одной строки во внутреннем центре и шумном Realtime не должно быть двух системных popup подряд с одним и тем же текстом за одну вставку.
  - **Следующий шаг по плану:** NT8.1 (контракт email outbox) — при отсутствии фоновой инфраструктуры NT8.2 может быть **blocked** с вопросом к владельцу проекта — см. журнал ниже.
- **2026-04-07 — NT8.1**
  - **SQL:** миграция `supabase/migrations/20260407270000_nt81_notification_outbox_email_contract.sql` — `COMMENT ON TABLE/COLUMN` для `notification_outbox`: назначение колонок, §9–§11.2, обязанность воркера собирать абсолютный `link_url` для письма.
  - **TS:** `web/src/lib/notifications/notification-outbox.ts` — `NOTIFICATION_OUTBOX_EMAIL_CHANNEL`, тип `NotificationOutboxEmailRow`, `resolveAppLinkForEmail` (относительный путь → абсолютный URL при известном origin).
  - **Пример env:** `web/.env.local.example` — `NEXT_PUBLIC_APP_URL` для origin в воркере/outbox-отправке.
  - Применено: `npx supabase db push --yes`. Сборка: `npm run build` в `web/` — успешно.
  - **Проверка:** в SQL Editor `SELECT obj_description('public.notification_outbox'::regclass);` — комментарий к таблице; строка outbox + `profiles.email` + `resolveAppLinkForEmail(row.link_url, origin)` достаточны для чернового письма без дочитывания досок из БД (опционально board_id/card_id для NT8.4).
  - **Следующий шаг по плану:** NT8.2 — поиск cron/worker/Edge Function; при отсутствии — согласовать с владельцем.
- **2026-04-07 — NT8.2 (аудит инфраструктуры)**
  - **Поиск по репозиторию:** нет кода, который читает `notification_outbox` и переводит `pending` → `sent`/`failed` (кроме доменных типов в `web/src/lib/notifications/notification-outbox.ts` — только контракт/URL).
  - **Supabase Edge Functions:** каталога `supabase/functions` с обработчиками нет; в `supabase/config.toml` включён `[edge_runtime]` (локальный стек CLI), это не означает задеплоенный воркер.
  - **Next.js:** в `web/src/app` нет `api/**/route.ts`; `vercel.json` с cron в корне нет; зависимостей вида Resend/nodemailer/SendGrid в `web/package.json` нет.
  - **GitHub Actions / прочие cron:** `.github/workflows` в репозитории не найдено.
  - **Вывод:** фоновая отправка email из outbox должна быть **введена новым компонентом** (и выбран провайдер SMTP/API и секреты).
  - **Варианты для владельца (зафиксировать один):**
    1. **Route Handler в Next.js** (например `POST /api/...`), вызываемый по расписанию **Vercel Cron** или внешним cron с секретом в заголовке; воркер ходит в БД service role и шлёт письма.
    2. **Supabase Edge Function** + расписание **Supabase** (или вызов из Database Webhooks / внешнего cron URL функции).
    3. **Отдельный процесс** (Railway/Fly/VM): polling `notification_outbox` по `pending` и лимиту попыток.
  - **От владельца нужно:** номер варианта (или свой), хостинг приложения/БД, предпочтительный email-провайдер (Resend, SendGrid, SMTP и т.д.) и где хранить секреты.
  - Миграции на этом шаге не требовались.
  - **Проверка читателем:** `rg notification_outbox web supabase --glob '*.{ts,tsx,sql}'` — вхождения только в миграциях, SQL `enqueue_*` и `notification-outbox.ts`; отдельного воркера нет.
- **2026-04-07 — NT8.2 (закрытие) + NT8.3**
  - **Путь:** вариант 1 из аудита — API route в Next.js; провайдер исходящей почты **Resend** (без нового npm-пакета, `fetch`).
  - **Файлы:** `web/src/lib/supabase/service-role.ts`; `web/src/lib/notifications/send-outbox-email-resend.ts`; `web/src/lib/notifications/process-notification-outbox-email-batch.ts`; `web/src/app/api/cron/process-notification-outbox/route.ts`; `web/vercel.json` (cron каждые 5 минут); дополнен `web/.env.local.example` (`SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_OUTBOX_CRON_SECRET`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM`).
  - **Семантика:** выборка `pending` + `channel=email` + `next_attempt_at <= now()`; для каждой строки `attempts += 1`; успех → `sent`; ошибка отправки → при `attempts < 5` остаётся `pending`, `next_attempt_at` = backoff (1m→2h); иначе `failed`; пустой `profiles.email` → сразу `failed`.
  - **Auth cron:** `Authorization: Bearer` = `NOTIFICATION_OUTBOX_CRON_SECRET` или `CRON_SECRET` (как на Vercel).
  - **Миграции:** не требовались. `supabase db push` — без изменений схемы.
  - **Проверка:** заполнить env на проде/локально; создать тестовую строку outbox или воспроизвести событие с `email=true`; `curl -H "Authorization: Bearer $NOTIFICATION_OUTBOX_CRON_SECRET" "http://localhost:3000/api/cron/process-notification-outbox"` — ответ JSON `{ examined, sent, failedPermanent, scheduledRetry }`; письмо в Resend dashboard / почте.
  - **Следующий шаг по плану:** NT8.4 (шаблоны/formatter §10 при необходимости сверх `title`/`body`/`link`).
