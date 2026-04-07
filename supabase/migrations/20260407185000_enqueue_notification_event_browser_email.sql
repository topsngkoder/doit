-- NT4.1 / NT4.2: Доставка уведомлений через каналы browser (internal_notifications) и email (notification_outbox).

CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_user_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_board_id uuid,
  p_card_id uuid,
  p_title text,
  p_body text,
  p_link_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_browser_enabled boolean;
  v_email_enabled boolean;
  v_inserted_browser boolean := false;
  v_inserted_email boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'recipient user_id is required';
  END IF;

  IF p_event_type IS NULL
    OR p_event_type NOT IN (
      'added_to_card',
      'made_responsible',
      'card_comment_new',
      'card_moved',
      'card_in_progress',
      'card_ready'
    ) THEN
    RAISE EXCEPTION 'unsupported event_type: %', COALESCE(p_event_type, 'null');
  END IF;

  -- «Не уведомлять автора»: ни внутренний центр, ни outbox.
  IF p_actor_user_id IS NOT NULL AND p_actor_user_id = p_user_id THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'actor_is_recipient',
      'browser_inserted', false,
      'email_inserted', false
    );
  END IF;

  v_browser_enabled := COALESCE(
    (
      SELECT np.enabled
      FROM public.notification_preferences np
      WHERE np.user_id = p_user_id
        AND np.channel = 'browser'
        AND np.event_type = p_event_type
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
      p_user_id,
      p_event_type,
      p_actor_user_id,
      p_board_id,
      p_card_id,
      p_title,
      p_body,
      p_link_url
    );
    v_inserted_browser := true;
  END IF;

  v_email_enabled := COALESCE(
    (
      SELECT np.enabled
      FROM public.notification_preferences np
      WHERE np.user_id = p_user_id
        AND np.channel = 'email'
        AND np.event_type = p_event_type
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
      p_user_id,
      'email',
      'pending',
      p_event_type,
      p_actor_user_id,
      p_board_id,
      p_card_id,
      p_title,
      p_body,
      p_link_url
    );
    v_inserted_email := true;
  END IF;

  RETURN jsonb_build_object(
    'skipped', false,
    'reason', NULL,
    'browser_inserted', v_inserted_browser,
    'email_inserted', v_inserted_email
  );
END;
$$;

COMMENT ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) IS 'Создаёт записи internal_notifications (browser) и notification_outbox email с учётом предпочтений и пропуска автора (NT4).';
