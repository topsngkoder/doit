-- NT2.1: notification_preferences — каналы browser | email, шесть типов событий.
-- Переименование каналов нужно до новых CHECK, иначе существующие строки не пройдут ограничения.

DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'notification_preferences'
      AND c.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.notification_preferences DROP CONSTRAINT %I', conname);
  END LOOP;
END;
$$;

UPDATE public.notification_preferences
SET channel = CASE channel
  WHEN 'internal' THEN 'browser'
  WHEN 'telegram' THEN 'email'
  ELSE channel
END
WHERE channel IN ('internal', 'telegram');

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_channel_check
  CHECK (channel IN ('browser', 'email'));

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_event_type_check
  CHECK (
    event_type IN (
      'added_to_card',
      'made_responsible',
      'card_comment_new',
      'card_moved',
      'card_in_progress',
      'card_ready'
    )
  );
