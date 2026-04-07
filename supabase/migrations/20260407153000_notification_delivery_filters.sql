-- K4: Centralize notification delivery filters.
-- Applies:
-- 1) "Do not notify action author"
-- 2) Per-user channel/event preferences (default = enabled)

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
  v_internal_enabled boolean := true;
  v_telegram_enabled boolean := true;
  v_has_telegram_link boolean := false;
  v_inserted_internal boolean := false;
  v_inserted_telegram boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'recipient user_id is required';
  END IF;

  IF p_event_type IS NULL
    OR p_event_type NOT IN ('added_to_card', 'made_responsible', 'card_comment_new', 'card_moved') THEN
    RAISE EXCEPTION 'unsupported event_type: %', COALESCE(p_event_type, 'null');
  END IF;

  -- Rule 10.6.2: action author should not receive this notification.
  IF p_actor_user_id IS NOT NULL AND p_actor_user_id = p_user_id THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'actor_is_recipient',
      'internal_inserted', false,
      'telegram_inserted', false
    );
  END IF;

  SELECT COALESCE(np.enabled, true)
  INTO v_internal_enabled
  FROM public.notification_preferences np
  WHERE np.user_id = p_user_id
    AND np.channel = 'internal'
    AND np.event_type = p_event_type
  LIMIT 1;

  IF v_internal_enabled THEN
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
    v_inserted_internal := true;
  END IF;

  SELECT COALESCE(np.enabled, true)
  INTO v_telegram_enabled
  FROM public.notification_preferences np
  WHERE np.user_id = p_user_id
    AND np.channel = 'telegram'
    AND np.event_type = p_event_type
  LIMIT 1;

  IF v_telegram_enabled THEN
    SELECT (p.telegram_chat_id IS NOT NULL)
    INTO v_has_telegram_link
    FROM public.profiles p
    WHERE p.user_id = p_user_id
    LIMIT 1;

    IF v_has_telegram_link THEN
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
        'telegram',
        'pending',
        p_event_type,
        p_actor_user_id,
        p_board_id,
        p_card_id,
        p_title,
        p_body,
        p_link_url
      );
      v_inserted_telegram := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'skipped', false,
    'reason', NULL,
    'internal_inserted', v_inserted_internal,
    'telegram_inserted', v_inserted_telegram
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) TO authenticated;

COMMENT ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) IS 'Creates internal/outbox notifications with author-skip and preference filters (K4).';

