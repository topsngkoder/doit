-- NT4.3: Одинаковые title/body/link для internal_notifications и notification_outbox;
-- заголовок — строго по спецификации §10.1; структурные проверки §10.2 (доска, карточка, тело, ссылка).
-- Имя автора и человекочитаемое описание — в p_body (формирует вызывающий код).

DROP FUNCTION IF EXISTS public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_user_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_board_id uuid,
  p_card_id uuid,
  p_body text,
  p_link_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_browser_enabled boolean;
  v_email_enabled boolean;
  v_inserted_browser boolean := false;
  v_inserted_email boolean := false;
  v_body text := trim(p_body);
  v_link text := trim(p_link_url);
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

  IF p_board_id IS NULL THEN
    RAISE EXCEPTION 'p_board_id is required (notification payload / spec §10.2)';
  END IF;

  IF p_card_id IS NULL THEN
    RAISE EXCEPTION 'p_card_id is required (notification payload / spec §10.2)';
  END IF;

  IF v_body IS NULL OR v_body = '' THEN
    RAISE EXCEPTION 'p_body must be non-empty (spec §10.2: board, card, author if any, event description)';
  END IF;

  IF v_link IS NULL OR v_link = '' THEN
    RAISE EXCEPTION 'p_link_url must be non-empty (spec §10.2)';
  END IF;

  v_title := CASE p_event_type
    WHEN 'added_to_card' THEN 'Вас добавили в карточку'
    WHEN 'made_responsible' THEN 'Сделали ответственным'
    WHEN 'card_comment_new' THEN 'Новый комментарий в карточке'
    WHEN 'card_moved' THEN 'Перемещение карточки'
    WHEN 'card_in_progress' THEN 'Ваша карточка в работе'
    WHEN 'card_ready' THEN 'Ваша карточка готова'
  END;

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
      v_title,
      v_body,
      v_link
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

REVOKE ALL ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
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
  text
) TO authenticated;

COMMENT ON FUNCTION public.enqueue_notification_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text
) IS
'Доставка browser (internal_notifications) и email (outbox). Заголовок — §10.1; p_body должен включать доска, карточка, автор при наличии, описание (§10.2); p_link_url — глубокая ссылка. Сигнатура без p_title: заголовок задаётся только типом события.';
