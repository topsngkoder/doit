-- G3: ручное назначение ответственного (те же права, что у mutate_card_assignee) + card_activity

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
  v_created_by uuid;
  v_current uuid;
  v_target_display text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT bc.board_id, c.created_by_user_id, c.responsible_user_id
  INTO v_board_id, v_created_by, v_current
  FROM public.cards c
  JOIN public.board_columns bc ON bc.id = c.column_id
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
END;
$$;

REVOKE ALL ON FUNCTION public.set_card_responsible_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_card_responsible_user(uuid, uuid) TO authenticated;
