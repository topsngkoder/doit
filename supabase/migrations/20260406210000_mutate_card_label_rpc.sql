-- G4: назначение/снятие метки на карточке + card_activity (атомарно)

CREATE OR REPLACE FUNCTION public.mutate_card_label(
  p_card_id uuid,
  p_label_id uuid,
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
  v_label_board uuid;
  v_label_name text;
  v_ins_count int;
  v_del_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT bc.board_id, c.created_by_user_id
  INTO v_board_id, v_created_by
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
    OR EXISTS (
      SELECT 1
      FROM public.card_assignees ca
      WHERE ca.card_id = p_card_id
        AND ca.user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Нет права менять метки этой карточки.';
  END IF;

  SELECT l.board_id, l.name
  INTO v_label_board, v_label_name
  FROM public.labels l
  WHERE l.id = p_label_id;

  IF v_label_board IS NULL THEN
    RAISE EXCEPTION 'Метка не найдена.';
  END IF;

  IF v_label_board <> v_board_id THEN
    RAISE EXCEPTION 'Метка принадлежит другой доске.';
  END IF;

  IF p_add THEN
    INSERT INTO public.card_labels (card_id, label_id)
    VALUES (p_card_id, p_label_id)
    ON CONFLICT (card_id, label_id) DO NOTHING;

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
        'label_added',
        format('Добавлена метка: %s', v_label_name),
        jsonb_build_object('label_id', p_label_id, 'label_name', v_label_name)
      );
    END IF;
  ELSE
    DELETE FROM public.card_labels
    WHERE card_id = p_card_id
      AND label_id = p_label_id;

    GET DIAGNOSTICS v_del_count = ROW_COUNT;

    IF v_del_count > 0 THEN
      INSERT INTO public.card_activity (
        card_id,
        actor_user_id,
        activity_type,
        message,
        payload
      ) VALUES (
        p_card_id,
        v_uid,
        'label_removed',
        format('Снята метка: %s', v_label_name),
        jsonb_build_object('label_id', p_label_id, 'label_name', v_label_name)
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_card_label(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_card_label(uuid, uuid, boolean) TO authenticated;
