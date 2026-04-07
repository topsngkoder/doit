-- NT5.1: Уведомление added_to_card при добавлении участника (spec §4.1).
-- mutate_card_assignee: только если INSERT реально добавил строку (ON CONFLICT DO NOTHING + ROW_COUNT).
-- create_card_with_details: для каждого assignee новой карточки; сам себе — пропуск в enqueue_notification_event.

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
  v_board_name text;
  v_card_title text;
  v_created_by uuid;
  v_responsible uuid;
  v_target_display text;
  v_actor_display text;
  v_notify_body text;
  v_notify_link text;
  v_ins_count int;
  v_del_count int;
  v_assignee_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT c.board_id, b.name, c.title, c.created_by_user_id, c.responsible_user_id
  INTO v_board_id, v_board_name, v_card_title, v_created_by, v_responsible
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
    RAISE EXCEPTION 'Нет права менять участников карточки.';
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

      v_notify_body := format(
        E'Вас добавили в карточку «%s» на доске «%s».\nАвтор действия: %s.',
        v_card_title,
        v_board_name,
        v_actor_display
      );
      v_notify_link := format('/boards/%s?card=%s', v_board_id::text, p_card_id::text);

      PERFORM public.enqueue_notification_event(
        p_assignee_user_id,
        'added_to_card',
        v_uid,
        v_board_id,
        p_card_id,
        v_notify_body,
        v_notify_link
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
  v_board_name text;
  v_actor_display text;
  v_notify_body text;
  v_notify_link text;
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

  SELECT b.name
  INTO v_board_name
  FROM public.boards b
  WHERE b.id = p_board_id;

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

  v_notify_link := format('/boards/%s?card=%s', p_board_id::text, v_card_id::text);

  FOREACH v_member IN ARRAY p_assignee_user_ids
  LOOP
    v_notify_body := format(
      E'Вас добавили в карточку «%s» на доске «%s».\nАвтор действия: %s.',
      p_title,
      v_board_name,
      v_actor_display
    );

    PERFORM public.enqueue_notification_event(
      v_member,
      'added_to_card',
      v_uid,
      p_board_id,
      v_card_id,
      v_notify_body,
      v_notify_link
    );
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
