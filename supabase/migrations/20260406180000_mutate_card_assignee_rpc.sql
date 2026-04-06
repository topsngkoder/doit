-- G2: добавление/исключение участника карточки с минимум одним assignee и записью в card_activity

CREATE OR REPLACE FUNCTION public.mutate_card_assignee(
  p_card_id uuid,
  p_assignee_user_id uuid,
  p_add boolean
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
  v_responsible uuid;
  v_target_display text;
  v_ins_count int;
  v_del_count int;
  v_assignee_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT bc.board_id, c.created_by_user_id, c.responsible_user_id
  INTO v_board_id, v_created_by, v_responsible
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
    RAISE EXCEPTION 'Нет права менять участников карточки.';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(p.email, '@', 1),
    'Участник'
  )
  INTO v_target_display
  FROM public.profiles p
  WHERE p.user_id = p_assignee_user_id;

  IF v_target_display IS NULL THEN
    v_target_display := 'Участник';
  END IF;

  IF p_add THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.board_members bm
      WHERE bm.board_id = v_board_id
        AND bm.user_id = p_assignee_user_id
    ) THEN
      RAISE EXCEPTION 'Пользователь не состоит на доске.';
    END IF;

    INSERT INTO public.card_assignees (card_id, user_id)
    VALUES (p_card_id, p_assignee_user_id)
    ON CONFLICT (card_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_ins_count = ROW_COUNT;

    IF v_ins_count > 0 THEN
      INSERT INTO public.card_activity (
        card_id,
        actor_user_id,
        activity_type,
        message,
        payload
      ) VALUES (
        p_card_id,
        v_uid,
        'assignee_added',
        format('Добавлен участник: %s', v_target_display),
        jsonb_build_object('user_id', p_assignee_user_id)
      );
    END IF;

  ELSE
    SELECT COUNT(*)::int
    INTO v_assignee_count
    FROM public.card_assignees ca
    WHERE ca.card_id = p_card_id;

    IF v_assignee_count <= 1 THEN
      RAISE EXCEPTION 'На карточке должен остаться хотя бы один участник.';
    END IF;

    DELETE FROM public.card_assignees
    WHERE card_id = p_card_id
      AND user_id = p_assignee_user_id;

    GET DIAGNOSTICS v_del_count = ROW_COUNT;

    IF v_del_count = 0 THEN
      RETURN;
    END IF;

    INSERT INTO public.card_activity (
      card_id,
      actor_user_id,
      activity_type,
      message,
      payload
    ) VALUES (
      p_card_id,
      v_uid,
      'assignee_removed',
      format('Исключён участник: %s', v_target_display),
      jsonb_build_object('user_id', p_assignee_user_id)
    );

    IF v_responsible IS NOT NULL AND v_responsible = p_assignee_user_id THEN
      UPDATE public.cards
      SET responsible_user_id = NULL
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
        'responsible_unset',
        format('Снят ответственный: %s', v_target_display),
        jsonb_build_object('user_id', p_assignee_user_id)
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_card_assignee(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_card_assignee(uuid, uuid, boolean) TO authenticated;
