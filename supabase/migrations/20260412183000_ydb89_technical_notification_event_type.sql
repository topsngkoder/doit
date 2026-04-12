-- YDB8.9: тип события «технические уведомления» для сбоев удаления вложений и др.;
-- RPC доставки с учётом notification_preferences (browser + email).

-- internal_notifications.event_type
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
      AND c.conname = 'internal_notifications_event_type_check'
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
      'card_ready',
      'technical'
    )
  );

-- notification_preferences.event_type
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
      AND c.conname = 'notification_preferences_event_type_check'
  LOOP
    EXECUTE format('ALTER TABLE public.notification_preferences DROP CONSTRAINT %I', conname);
  END LOOP;
END;
$$;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_event_type_check
  CHECK (
    event_type IN (
      'added_to_card',
      'made_responsible',
      'card_comment_new',
      'card_moved',
      'card_in_progress',
      'card_ready',
      'technical'
    )
  );

-- notification_outbox.event_type
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
      AND c.conname = 'notification_outbox_event_type_check'
  LOOP
    EXECUTE format('ALTER TABLE public.notification_outbox DROP CONSTRAINT %I', conname);
  END LOOP;
END;
$$;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_event_type_check
  CHECK (
    event_type IN (
      'added_to_card',
      'made_responsible',
      'card_comment_new',
      'card_moved',
      'card_in_progress',
      'card_ready',
      'technical'
    )
  );

INSERT INTO public.notification_preferences (user_id, channel, event_type, enabled)
SELECT p.user_id, v.channel, v.event_type, true
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('browser', 'technical'),
    ('email', 'technical')
) AS v(channel, event_type)
ON CONFLICT (user_id, channel, event_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enqueue_technical_notification(
  p_title text,
  p_body text,
  p_link_url text,
  p_board_id uuid DEFAULT NULL,
  p_card_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_title text := trim(p_title);
  v_body text := trim(p_body);
  v_link text := trim(p_link_url);
  v_browser_enabled boolean;
  v_email_enabled boolean;
  v_inserted_browser boolean := false;
  v_inserted_email boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'p_title must be non-empty';
  END IF;

  IF v_body IS NULL OR v_body = '' THEN
    RAISE EXCEPTION 'p_body must be non-empty';
  END IF;

  IF v_link IS NULL OR v_link = '' THEN
    RAISE EXCEPTION 'p_link_url must be non-empty';
  END IF;

  v_browser_enabled := COALESCE(
    (
      SELECT np.enabled
      FROM public.notification_preferences np
      WHERE np.user_id = uid
        AND np.channel = 'browser'
        AND np.event_type = 'technical'
      LIMIT 1
    ),
    true
  );

  IF v_browser_enabled THEN
    INSERT INTO public.internal_notifications (
      user_id,
      event_type,
      actor_user_id,
      board_id,
      card_id,
      title,
      body,
      link_url
    )
    VALUES (
      uid,
      'technical',
      NULL,
      p_board_id,
      p_card_id,
      v_title,
      v_body,
      v_link
    );
    v_inserted_browser := true;
  END IF;

  v_email_enabled := COALESCE(
    (
      SELECT np.enabled
      FROM public.notification_preferences np
      WHERE np.user_id = uid
        AND np.channel = 'email'
        AND np.event_type = 'technical'
      LIMIT 1
    ),
    true
  );

  IF v_email_enabled THEN
    INSERT INTO public.notification_outbox (
      user_id,
      channel,
      status,
      event_type,
      actor_user_id,
      board_id,
      card_id,
      title,
      body,
      link_url
    )
    VALUES (
      uid,
      'email',
      'pending',
      'technical',
      NULL,
      p_board_id,
      p_card_id,
      v_title,
      v_body,
      v_link
    );
    v_inserted_email := true;
  END IF;

  RETURN jsonb_build_object(
    'browser_inserted', v_inserted_browser,
    'email_inserted', v_inserted_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_technical_notification(text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_technical_notification(text, text, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.enqueue_technical_notification(text, text, text, uuid, uuid) IS
  'YDB8.9: техническое уведомление текущему пользователю (browser internal_notifications + email outbox по предпочтениям).';
