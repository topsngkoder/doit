-- NT2.4: удаление notification_user_settings (таймзона и тихие часы не входят в целевую модель).
-- Триггер updated_at и политики RLS удаляются вместе с таблицей.

DROP TABLE IF EXISTS public.notification_user_settings;
