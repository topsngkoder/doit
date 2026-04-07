-- NT2.2: notification_outbox — канал только email, шесть типов событий.

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
      AND t.relname = 'notification_outbox'
      AND c.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.notification_outbox DROP CONSTRAINT %I', conname);
  END LOOP;
END;
$$;

UPDATE public.notification_outbox
SET channel = 'email'
WHERE channel = 'telegram';

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_channel_check
  CHECK (channel = 'email');

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN ('pending', 'sent', 'failed'));

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_event_type_check
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

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_attempts_range CHECK (attempts >= 0 AND attempts <= 5);
