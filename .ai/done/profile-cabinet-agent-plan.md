# План реализации “Личный кабинет” (для AI‑агента)

Основано на `.ai/profile-cabinet-specification.md`. Цель плана — дать исполняемую декомпозицию: БД/Storage/RLS → server actions → UI → проверка критериев приёмки.

## 0) Входные решения (зафиксировано)
- **Существующие пользователи**: сценарий **A** — если у пользователя нет `first_name/last_name`, он обязан заполнить их при первом заходе в `/profile` (форма блокирует “готово”, пока не заполнено).
- **Signed URL TTL (аватар)**: **как у фона доски** — 1 час (см. `web/src/app/boards/[boardId]/board-background-frame.tsx`).
- **Инициалы вместо аватара**: если `avatar_url` отсутствует → показывать первые буквы имени и фамилии (если имени/фамилии ещё нет → запасной вариант, см. задачy PC5.6).
- **Регистрация (решение агента)**: добавить отдельную страницу регистрации `/signup`, которая собирает `first_name/last_name` сразу и кладёт их в `raw_user_meta_data`, чтобы триггер на `auth.users` создавал строку `profiles` уже с нужными полями.

## 1) Технический контекст проекта (важно для интеграции)
- **Frontend**: Next.js 15 (app router), TS, Tailwind.
- **Supabase**: используется через `@supabase/ssr` (helpers `web/src/lib/supabase/{server,client}.ts`).
- **Guard**: `web/src/middleware.ts` уже редиректит гостей с protected‑маршрутов на `/login` (нужно расширить под `/profile`).
- **RLS profiles**: есть policy `profiles_update_own` (обновлять можно только свою строку) и `profiles_select_own_or_shared_board`.
- **Storage**: есть реализованный паттерн bucket+signed url+localStorage cache для `board-backgrounds` (использовать как референс).

## 2) Стратегия выполнения (как агенту идти, чтобы не ломать прод)
- Двигаться вертикально: **DDL/RLS/Storage policies → server actions → UI**.
- Данные `profiles.first_name/last_name` вводятся пользователем (через `/signup` или `/profile`) и становятся источником `display_name = first_name + ' ' + last_name`.
- Из-за сценария **A** вводим поля в БД **как nullable** (иначе миграция упадёт на уже существующих строках). “Строго NOT NULL” — вынести в финальное hardening‑шаг (PC8.4), когда данные будут заполнены.

## 3) Трекер задач (живой чеклист)
Статусы: `todo | doing | blocked | done`.

### EPIC PC1 — БД: расширение `profiles` под персональные поля
- [x] **PC1.1 (done)** Добавить миграцию: поля в `public.profiles`
  - **DDL**:
    - добавить `first_name text null`, `last_name text null`, `position text null`, `department text null`
    - оставить `display_name` и `avatar_url` как есть (совместимость)
  - **DB constraints (рекомендуемо)**:
    - `CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 50)`
    - `CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 50)`
    - `CHECK (position IS NULL OR char_length(btrim(position)) BETWEEN 1 AND 100)`
    - `CHECK (department IS NULL OR char_length(btrim(department)) BETWEEN 1 AND 100)`
  - **DoD**: миграция применяется, существующие строки не ломаются.
- [x] **PC1.2 (done)** Обновить триггер `public.handle_new_auth_user()`
  - читать из `NEW.raw_user_meta_data` значения `first_name`, `last_name`, `position`, `department`
  - писать:
    - `first_name/last_name/position/department` (как `NULLIF(btrim(...),'')`)
    - `display_name = btrim(first_name || ' ' || last_name)` если оба присутствуют; иначе fallback на текущий алгоритм (local-part email)
  - **DoD**: новый пользователь после signup получает строку `profiles` с `first_name/last_name`.
- [x] **PC1.3 (done)** Протокол “первый заход в `/profile`”
  - на уровне UI/логики запретить “считать профиль заполненным”, если `first_name` или `last_name` отсутствуют/пустые после `trim`
  - **DoD**: существующий пользователь (с null‑полями) видит требование заполнить.

### EPIC PC2 — Supabase Storage: bucket `avatars` + политики
- [x] **PC2.1 (done)** Миграция: создать bucket `avatars`
  - `private`
  - `allowed_mime_types = ['image/jpeg']`
  - `file_size_limit = 102400` (100 КБ)
  - **DoD**: bucket существует и принимает только JPEG ≤100KB.
- [x] **PC2.2 (done)** Политики `storage.objects` для `avatars`
  - Разрешить `SELECT/INSERT/UPDATE/DELETE` только для `authenticated`
  - Ограничение пути: **строго** `<auth.uid()>/avatar.jpg`
  - Подход: как у `board-backgrounds` — через `SECURITY DEFINER` helper‑функции, чтобы безопасно парсить имя объекта и не падать на “кривых” строках.
  - **DoD**: пользователь не может читать/писать чужие объекты и не может писать не‑`avatar.jpg`.

### EPIC PC3 — Server Actions: профиль и аватар (без обхода RLS)
Цель: все операции происходят под сессией пользователя и проходят RLS/Storage policies.

- [x] **PC3.1 (done)** `updateProfileAction`
  - Локация: `web/src/app/profile/actions.ts` (паттерн как `web/src/app/boards/[boardId]/actions.ts`)
  - Вход: `{ firstName, lastName, position?, department? }`
  - Нормализация:
    - обязательные: `trim`, непусто, длины 1..50
    - необязательные: `trim`, пусто → `null`, длины 1..100
  - Запись в БД:
    - update своей строки (`eq('user_id', user.id)`)
    - `display_name = first_name + ' ' + last_name`
  - Сообщения ошибок: строго по спецификации (раздел 11).
  - **DoD**: “Профиль сохранен” после успеха, при ошибке — “Не удалось сохранить профиль. Повторите попытку”.
- [x] **PC3.2 (done)** `uploadAvatarAction(normalizedJpegFile: File)`
  - Проверки на “серверной стороне” (спецификация 10.3):
    - пользователь авторизован
    - итоговый размер `<= 102400`
    - итоговый файл действительно JPEG: минимум проверка `contentType==='image/jpeg'` + сигнатура байтов (FF D8 …)
  - Upload:
    - bucket: `avatars`
    - path: `${user.id}/avatar.jpg`
    - `upsert=true`
  - DB update: `profiles.avatar_url = '<user_id>/avatar.jpg'`
  - Ошибка: “Не удалось загрузить аватар. Повторите попытку”.
  - **DoD**: после загрузки превью обновляется сразу, `avatar_url` в БД обновлён.
- [x] **PC3.3 (done)** `deleteAvatarAction()`
  - удалить объект (если есть) и поставить `profiles.avatar_url = null`
  - ошибки: “Не удалось удалить аватар. Повторите попытку”.
  - **DoD**: превью переходит на инициалы, объект удалён.

### EPIC PC4 — Клиентская обработка изображения (строго по разделу 8)
Локация: `web/src/lib/images/avatar-normalize.ts` (или аналогичный модуль).

- [x] **PC4.1 (done)** Декодирование “любого формата, который умеет браузер”
  - вход: `File`
  - попытка декодировать через `createImageBitmap` или `<img src=ObjectURL>`
  - если декодирование невозможно → показать “Файл не поддерживается на вашем устройстве”
- [x] **PC4.2 (done)** Масштабирование (max side ≤ 512, без апскейла)
- [x] **PC4.3 (done)** Прозрачность → белый фон `#FFFFFF`
- [x] **PC4.4 (done)** Алгоритм сжатия до 100KB (фиксированный порядок)
  - quality старт 0.85, шаг 0.05, минимум 0.40
  - если всё ещё >100KB на 0.40 → уменьшать max side на 10% и повторять цикл
  - минимальная сторона 128px; если не получилось → “Не удалось уменьшить файл до 100 КБ”
- [x] **PC4.5 (done)** Анимированные GIF/WEBP → первый кадр
  - (для большинства браузеров “первый кадр” получается автоматически при рисовании в canvas; важно не пытаться сохранять анимацию)
- [x] **PC4.6 (done)** Контракт результата нормализации
  - вернуть `File`/`Blob` с `type: image/jpeg`, именем `avatar.jpg`, и метаданными (`width/height/bytes`) для дебага/UX (не обязателен UI‑показ).

### EPIC PC5 — UI `/profile`: экран личного кабинета
- [x] **PC5.1 (done)** Маршрут и guard
  - создать `web/src/app/profile/page.tsx`
  - на сервере проверить `auth.getUser()` → если нет пользователя → `redirect('/login')`
- [x] **PC5.2 (done)** Загрузка текущих данных профиля
  - `select` из `profiles` по `user_id = user.id`: `first_name,last_name,position,department,avatar_url,email,display_name`
  - обработать “профиль не найден” (маловероятно, но возможно при рассинхроне) — показать ошибку/инструкцию.
- [x] **PC5.3 (done)** Компонент формы
  - поля: Имя*, Фамилия*, Должность, Отдел
  - UX:
    - “Сохранить” активно только если есть изменения и нет ошибок
    - ошибки — строго из спецификации
    - после успеха — Toast “Профиль сохранен”
- [x] **PC5.4 (done)** Блок аватара
  - превью: если `avatar_url` есть → signed URL (TTL 1 час) + кеш (по аналогии с `board-background-frame.tsx`)
  - кнопки:
    - “Загрузить” → file picker → нормализация (PC4) → server action upload (PC3.2)
    - “Удалить” → server action delete (PC3.3)
- [x] **PC5.5 (done)** Инициалы, если аватара нет
  - показывать первые буквы `first_name` и `last_name` (верхний регистр)
- [x] **PC5.6 (done)** Сценарий “имя/фамилия ещё не заполнены”
  - если `first_name/last_name` null/пустые → в UI:
    - показать заметный блок “Заполните имя/фамилию”
    - в аватар‑превью показывать fallback (например, “?” или первую букву email), пока нет инициалов
    - не считать профиль “валидным”, пока обязательные поля не заполнены

### EPIC PC6 — Навигация и middleware
- [x] **PC6.1 (done)** Добавить пункт меню “Личный кабинет”
  - обновить `web/src/app/layout.tsx`: добавить link `/profile`
  - (опционально) скрывать “Вход” для авторизованных — отдельным улучшением, не блокирует критерии.
- [x] **PC6.2 (done)** Расширить protected‑маршруты в `web/src/middleware.ts`
  - добавить `/profile` в `isProtected`
  - **DoD**: гость на `/profile` уходит на `/login` на уровне middleware.

### EPIC PC7 — Регистрация `/signup` (чтобы имя/фамилия были обязательны при создании аккаунта)
Цель: выполнить твоё требование “просить заполнить имя и фамилию при регистрации”.

- [x] **PC7.1 (done)** Страница `web/src/app/signup/page.tsx`
  - форма: email, password, first_name, last_name, (опц.) position, department
  - валидации: те же правила длины/trim, что в профиле
- [x] **PC7.2 (done)** Server action `signUpAction`
  - `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, position, department }}})`
  - UX:
    - при успехе: либо сразу redirect на `/boards` (если сессия появилась), либо показать сообщение “Проверьте почту” (если confirm email включён)
- [x] **PC7.3 (done)** Ссылка на регистрацию
  - добавить линк “Регистрация” на `/login` и/или в header.
- [x] **PC7.4 (done)** Проверка триггера `handle_new_auth_user`
  - **Ревью цепочки:** `signUpAction` передаёт в `options.data` ключи `first_name`, `last_name`, опционально `position`, `department`. Триггер `public.handle_new_auth_user()` (миграция `supabase/migrations/20260407161000_update_handle_new_auth_user_profile_fields.sql`) читает те же поля из `NEW.raw_user_meta_data`. У Supabase поле `options.data` при регистрации попадает в `auth.users.raw_user_meta_data`, с чего и срабатывает триггер.
  - **Ручная проверка у себя:** зарегистрировать нового пользователя на `/signup` → в Table Editor или SQL Editor: `select first_name, last_name, display_name, position, department from public.profiles where email = '<email>';` — ожидаются заполненные имя/фамилия и `display_name` как «Имя Фамилия».

### EPIC PC8 — Приёмка, безопасность, hardening
- [ ] **PC8.1 (todo)** Ручной тест‑скрипт (минимум)
  - Гость: открыть `/profile` → редирект на `/login`
  - Новый пользователь: `/signup` → заполнить имя/фамилию → после регистрации в `profiles` есть `first_name/last_name`, `display_name` корректный
  - Профиль: поменять имя/фамилию/позицию/отдел → сохранить → toast “Профиль сохранен”
  - Очистка `position/department` → в БД `NULL`
  - Аватар: загрузить PNG с прозрачностью → итог JPEG, фон белый, размер ≤100KB
  - Пере-загрузка аватара → файл перезаписан (`upsert=true`)
  - Удаление аватара → объект удалён, `avatar_url = NULL`
- [ ] **PC8.2 (todo)** Проверки безопасности (RLS/Storage)
  - попытка прочитать/удалить чужой аватар через Storage API → отказ
  - попытка обновить чужой `profiles` row → отказ (RLS)
- [ ] **PC8.3 (todo)** Нефункциональные требования (smoke)
  - обработка+upload аватара в типичном сценарии укладывается ~3 сек
- [ ] **PC8.4 (todo, optional hardening)** “Строго по спецификации”: сделать `first_name/last_name NOT NULL`
  - выполнять отдельной миграцией после того, как данные у существующих пользователей заполнены
  - иначе заблокирует деплой (из-за сценария A).

## 4) Список файлов/модулей, которые почти наверняка будут затронуты
- `supabase/migrations/20*_profiles_first_last_position_department.sql` (новый)
- `supabase/migrations/20*_avatars_storage.sql` (новый)
- `supabase/migrations/20260317123000_auto_create_profiles_on_auth_signup.sql` (обновление логики триггера или новая миграция, которая делает `CREATE OR REPLACE FUNCTION ...`)
- `web/src/app/profile/page.tsx` (новый)
- `web/src/app/profile/actions.ts` (новый)
- `web/src/app/signup/page.tsx` (новый)
- `web/src/app/signup/actions.ts` (новый)
- `web/src/lib/images/avatar-normalize.ts` (новый)
- `web/src/middleware.ts` (обновить)
- `web/src/app/layout.tsx` (обновить навигацию)

## 5) Примечания по совместимости
- `display_name` остаётся в таблице и продолжает использоваться в существующих местах (например, snapshot доски), но должен быть **производным** от `first_name/last_name` после первого сохранения профиля/регистрации.
- Поля `first_name/last_name` вводятся как nullable из-за сценария A; UI обеспечивает обязательность.
- Вне плана: для `web/src/app/boards/[boardId]/page.tsx` добавлена серверная генерация signed URL для `profiles.avatar_url` (bucket `avatars`), чтобы аватары в карточках/участниках корректно отображались с приватным bucket.
- Bugfix (2026-04-07): добавлена миграция `supabase/migrations/20260407170000_avatars_storage_select_all_authenticated.sql` — `SELECT` в `storage.objects` для bucket `avatars` открыт всем `authenticated` (иначе в карточках/участниках отображался только собственный аватар, а чужие signed URL не генерировались из-за RLS). Права `INSERT/UPDATE/DELETE` остаются только на свой путь `<auth.uid()>/avatar.jpg`.
- UI tweak (2026-04-07): в `web/src/app/boards/[boardId]/board-columns-dnd.tsx` в карточках заменён текст `Комментарии: N` на компактное отображение `иконка комментария + N` для более минималистичного дизайна.
- UI tweak (2026-04-07): в `web/src/app/boards/[boardId]/board-columns-dnd.tsx` в карточках ответственный пользователь отображается первым среди аватаров исполнителей и выделяется золотистой обводкой.

