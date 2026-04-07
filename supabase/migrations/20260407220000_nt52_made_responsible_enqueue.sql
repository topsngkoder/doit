-- NT5.2: Уведомление made_responsible при смене cards.responsible_user_id (spec §4.2).
-- Ручное назначение через set_card_responsible_user; идемпотентность и «не себе» — как в RPC / enqueue.

CREATE OR REPLACE FUNCTION public.set_card_responsible_user(
  p_card_id uuid,
  p_responsible_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_board_id uuid;
  v_board_name text;
  v_card_title text;
  v_created_by uuid;
  v_current uuid;
  v_target_display text;
  v_actor_display text;
  v_notify_body text;
  v_notify_link text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT c.board_id, b.name, c.title, c.created_by_user_id, c.responsible_user_id
  INTO v_board_id, v_board_name, v_card_title, v_created_by, v_current
  FROM public.cards c
  JOIN public.boards b ON b.id = c.board_id
  WHERE c.id = p_card_id;

  IF v_board_id IS NULL THEN
    RAISE EXCEPTION 'Карточка не найдена.';
  END IF;

  IF NOT (
    public.has_board_permission(v_board_id, 'cards.edit_any')
    OR (
      public.has_board_permission(v_board_id, 'cards.edit_own')
      AND v_created_by = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Нет права назначать ответственного.';
  END IF;

  IF v_current IS NOT DISTINCT FROM p_responsible_user_id THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.card_assignees ca
    WHERE ca.card_id = p_card_id
      AND ca.user_id = p_responsible_user_id
  ) THEN
    RAISE EXCEPTION 'Ответственным может быть только участник карточки.';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(p.email, '@', 1),
    'Участник'
  )
  INTO v_target_display
  FROM public.profiles p
  WHERE p.user_id = p_responsible_user_id;

  IF v_target_display IS NULL THEN
    v_target_display := 'Участник';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(p.email, '@', 1),
    'Пользователь'
  )
  INTO v_actor_display
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF v_actor_display IS NULL THEN
    v_actor_display := 'Пользователь';
  END IF;

  UPDATE public.cards
  SET responsible_user_id = p_responsible_user_id
  WHERE id = p_card_id;

  INSERT INTO public.card_activity (
    card_id,
    actor_user_id,
    activity_type,
    message,
    payload
  ) VALUES (
    p_card_id,
    v_uid,
    'responsible_set',
    format('Назначен ответственный: %s', v_target_display),
    jsonb_build_object('responsible_user_id', p_responsible_user_id)
  );

  v_notify_body := format(
    E'Вас назначили ответственным за карточку «%s» на доске «%s».\nАвтор действия: %s.',
    v_card_title,
    v_board_name,
    v_actor_display
  );
  v_notify_link := format('/boards/%s?card=%s', v_board_id::text, p_card_id::text);

  PERFORM public.enqueue_notification_event(
    p_responsible_user_id,
    'made_responsible',
    v_uid,
    v_board_id,
    p_card_id,
    v_notify_body,
    v_notify_link
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_card_responsible_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_card_responsible_user(uuid, uuid) TO authenticated;
