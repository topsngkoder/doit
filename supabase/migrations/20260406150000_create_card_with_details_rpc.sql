-- Doit: атомарное создание карточки с участниками и значениями пользовательских полей (F4)

CREATE OR REPLACE FUNCTION public.create_card_with_details(
  p_board_id uuid,
  p_column_id uuid,
  p_title text,
  p_assignee_user_ids uuid[],
  p_field_values jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card_id uuid;
  v_pos double precision;
  v_member uuid;
  r_def RECORD;
  r_fname text;
  v_elem jsonb;
  v_fid uuid;
  v_ftype text;
  v_req boolean;
  v_text text;
  v_date date;
  v_link_url text;
  v_link_text text;
  v_opt uuid;
  v_trim text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  IF NOT public.has_board_permission(p_board_id, 'cards.create') THEN
    RAISE EXCEPTION 'Нет права создавать карточки на этой доске.';
  END IF;

  p_title := trim(p_title);
  IF char_length(p_title) < 1 OR char_length(p_title) > 200 THEN
    RAISE EXCEPTION 'Название: от 1 до 200 символов.';
  END IF;

  IF p_assignee_user_ids IS NULL OR COALESCE(array_length(p_assignee_user_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Выберите хотя бы одного участника карточки.';
  END IF;

  p_assignee_user_ids := ARRAY(SELECT DISTINCT unnest(p_assignee_user_ids));

  IF NOT EXISTS (
    SELECT 1
    FROM public.board_columns bc
    WHERE bc.id = p_column_id
      AND bc.board_id = p_board_id
  ) THEN
    RAISE EXCEPTION 'Колонка не принадлежит этой доске.';
  END IF;

  FOREACH v_member IN ARRAY p_assignee_user_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.board_members bm
      WHERE bm.board_id = p_board_id
        AND bm.user_id = v_member
    ) THEN
      RAISE EXCEPTION 'Участник не состоит на доске.';
    END IF;
  END LOOP;

  SELECT COALESCE(MAX(c.position), -1) + 1
  INTO v_pos
  FROM public.cards c
  WHERE c.column_id = p_column_id;

  INSERT INTO public.cards (
    board_id,
    column_id,
    title,
    description,
    position,
    created_by_user_id,
    responsible_user_id,
    moved_to_column_at
  ) VALUES (
    p_board_id,
    p_column_id,
    p_title,
    '',
    v_pos,
    v_uid,
    NULL,
    now()
  )
  RETURNING id INTO v_card_id;

  FOREACH v_member IN ARRAY p_assignee_user_ids
  LOOP
    INSERT INTO public.card_assignees (card_id, user_id)
    VALUES (v_card_id, v_member);
  END LOOP;

  FOR r_def IN
    SELECT d.id, d.name AS fname, d.field_type, d.is_required
    FROM public.board_field_definitions d
    WHERE d.board_id = p_board_id
    ORDER BY d.position
  LOOP
    v_fid := r_def.id;
    r_fname := r_def.fname;
    v_ftype := r_def.field_type;
    v_req := r_def.is_required;

    SELECT e
    INTO v_elem
    FROM jsonb_array_elements(p_field_values) AS t(e)
    WHERE (e->>'field_definition_id')::uuid = v_fid
    LIMIT 1;

    v_text := NULL;
    v_date := NULL;
    v_link_url := NULL;
    v_link_text := NULL;
    v_opt := NULL;

    IF v_ftype = 'text' THEN
      IF v_elem IS NULL OR v_elem->>'text_value' IS NULL THEN
        v_trim := '';
      ELSE
        v_trim := trim(v_elem->>'text_value');
      END IF;
      IF v_req AND (v_trim = '') THEN
        RAISE EXCEPTION 'Заполните обязательное поле «%».', r_fname;
      END IF;
      IF v_trim <> '' THEN
        v_text := v_trim;
        INSERT INTO public.card_field_values (card_id, field_definition_id, text_value)
        VALUES (v_card_id, v_fid, v_text);
      END IF;

    ELSIF v_ftype = 'date' THEN
      IF v_elem IS NULL OR v_elem->>'date_value' IS NULL OR trim(v_elem->>'date_value') = '' THEN
        IF v_req THEN
          RAISE EXCEPTION 'Заполните обязательное поле «%».', r_fname;
        END IF;
      ELSE
        BEGIN
          v_date := (trim(v_elem->>'date_value'))::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Некорректная дата в поле «%».', r_fname;
        END;
        INSERT INTO public.card_field_values (card_id, field_definition_id, date_value)
        VALUES (v_card_id, v_fid, v_date);
      END IF;

    ELSIF v_ftype = 'link' THEN
      IF v_elem IS NULL OR v_elem->>'link_url' IS NULL THEN
        v_link_url := '';
      ELSE
        v_link_url := trim(v_elem->>'link_url');
      END IF;
      IF v_elem IS NULL OR v_elem->>'link_text' IS NULL THEN
        v_link_text := NULL;
      ELSE
        v_link_text := nullif(trim(v_elem->>'link_text'), '');
      END IF;
      IF v_req AND v_link_url = '' THEN
        RAISE EXCEPTION 'Укажите ссылку в поле «%».', r_fname;
      END IF;
      IF v_link_url <> '' THEN
        INSERT INTO public.card_field_values (card_id, field_definition_id, link_url, link_text)
        VALUES (v_card_id, v_fid, v_link_url, v_link_text);
      END IF;

    ELSIF v_ftype = 'select' THEN
      IF v_elem IS NULL OR v_elem->>'select_option_id' IS NULL OR trim(v_elem->>'select_option_id') = '' THEN
        IF v_req THEN
          RAISE EXCEPTION 'Выберите значение в поле «%».', r_fname;
        END IF;
      ELSE
        v_opt := (trim(v_elem->>'select_option_id'))::uuid;
        IF NOT EXISTS (
          SELECT 1
          FROM public.board_field_select_options o
          WHERE o.id = v_opt
            AND o.field_definition_id = v_fid
        ) THEN
          RAISE EXCEPTION 'Недопустимая опция в поле «%».', r_fname;
        END IF;
        INSERT INTO public.card_field_values (card_id, field_definition_id, select_option_id)
        VALUES (v_card_id, v_fid, v_opt);
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.card_activity (
    card_id,
    actor_user_id,
    activity_type,
    message,
    payload
  ) VALUES (
    v_card_id,
    v_uid,
    'card_created',
    'Создана карточка',
    jsonb_build_object('title', p_title)
  );

  RETURN v_card_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_card_with_details(uuid, uuid, text, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_card_with_details(uuid, uuid, text, uuid[], jsonb) TO authenticated;
