-- NT2.3: internal_notifications — допустимые event_type: шесть значений по спецификации.

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
      AND t.relname = 'internal_notifications'
      AND c.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.internal_notifications DROP CONSTRAINT %I', conname);
  END LOOP;
END;
$$;

ALTER TABLE public.internal_notifications
  ADD CONSTRAINT internal_notifications_event_type_check
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
