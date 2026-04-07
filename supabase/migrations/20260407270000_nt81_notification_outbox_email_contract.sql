-- NT8.1: зафиксировать контракт email outbox для воркера доставки (спецификация §9–§11.2).

COMMENT ON TABLE public.notification_outbox IS
'Очередь исходящих email по событиям уведомлений. Канал только email. Статусы: pending | sent | failed; attempts до 5. Тема письма: title (формулировки §10.1, в enqueue_notification_event совпадает с internal_notifications). Тело письма: body — plain text UTF-8; должно удовлетворять §10.2 (доска, карточка, автор при наличии, описание). Получатель: user_id; email берётся из profiles.email (или актуальной записи пользователя на момент отправки). link_url — ссылка на доску/карточку в приложении; часто относительный путь (/boards/...). Для письма воркер обязан собрать абсолютный URL с публичным origin веб-приложения (см. web/src/lib/notifications/notification-outbox.ts, resolveAppLinkForEmail).';

COMMENT ON COLUMN public.notification_outbox.user_id IS
'Получатель уведомления; для письма — FK на profiles, email в profiles.email.';

COMMENT ON COLUMN public.notification_outbox.channel IS
'Только email (§11.2).';

COMMENT ON COLUMN public.notification_outbox.status IS
'pending — ждёт отправки; sent — успешно; failed — исчерпаны попытки или финальная ошибка (§9.2).';

COMMENT ON COLUMN public.notification_outbox.event_type IS
'Один из шести типов §3.1 / §11.2; заголовок письма деривируется только из типа (§10.1).';

COMMENT ON COLUMN public.notification_outbox.actor_user_id IS
'Автор действия; NULL если не применимо. Правило «не уведомлять автора» отсекается в enqueue до вставки в outbox.';

COMMENT ON COLUMN public.notification_outbox.board_id IS
'Контекст доски для шаблона и ссылок; может использоваться воркером вместе с card_id.';

COMMENT ON COLUMN public.notification_outbox.card_id IS
'Контекст карточки; для писем по карточным событиям обычно NOT NULL после валидации enqueue.';

COMMENT ON COLUMN public.notification_outbox.title IS
'Тема письма = заголовок уведомления §10.1 (дублирует логику internal_notifications.title).';

COMMENT ON COLUMN public.notification_outbox.body IS
'Текст письма plain text; человекочитаемое тело с данными §10.2 (формирует вызывающий код в p_body).';

COMMENT ON COLUMN public.notification_outbox.link_url IS
'URL перехода: путь в приложении или абсолютный URL; для email клиентов воркер должен отдать абсолютный https URL.';

COMMENT ON COLUMN public.notification_outbox.attempts IS
'Число попыток отправки; верхняя граница 5 (§9.2).';

COMMENT ON COLUMN public.notification_outbox.next_attempt_at IS
'Когда снова можно взять запись в работу (бэкофф воркера).';

COMMENT ON COLUMN public.notification_outbox.last_error IS
'Последняя ошибка транспорта/провайдера для диагностики.';
