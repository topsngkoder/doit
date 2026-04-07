-- NT3.2: По умолчанию включены оба канала для новых типов событий card_in_progress / card_ready.
-- Строки создаём для всех текущих профилей; при совпадении ключа ничего не меняем (уже есть явная настройка).

INSERT INTO public.notification_preferences (user_id, channel, event_type, enabled)
SELECT p.user_id, v.channel, v.event_type, true
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('browser', 'card_in_progress'),
    ('browser', 'card_ready'),
    ('email', 'card_in_progress'),
    ('email', 'card_ready')
) AS v(channel, event_type)
ON CONFLICT (user_id, channel, event_type) DO NOTHING;
