-- YDB7.1: тип поля yandex_disk в каталоге; RPC не пишет значения в card_field_values.

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

    ELSIF v_ftype = 'yandex_disk' THEN
      -- Значения файлов в public.card_attachments, не в card_field_values.
      NULL;
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

-- G5: редактирование названия, описания и пользовательских полей карточки в одной транзакции + card_activity

CREATE OR REPLACE FUNCTION public.update_card_body_and_custom_fields(
  p_card_id uuid,
  p_title text,
  p_description text,
  p_field_values jsonb DEFAULT '[]'::jsonb
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
  v_old_title text;
  v_old_desc text;
  r_def RECORD;
  r_fname text;
  v_elem jsonb;
  v_fid uuid;
  v_ftype text;
  v_req boolean;
  v_date date;
  v_link_url text;
  v_link_text text;
  v_opt uuid;
  v_trim text;
  v_ex text;
  v_ex_d date;
  v_ex_u text;
  v_ex_lt text;
  v_ex_opt uuid;
  v_disp_old text;
  v_disp_new text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  SELECT c.board_id, c.created_by_user_id, c.title, c.description
  INTO v_board_id, v_created_by, v_old_title, v_old_desc
  FROM public.cards c
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
    OR (
      EXISTS (
        SELECT 1
        FROM public.card_assignees ca
        WHERE ca.card_id = p_card_id
          AND ca.user_id = v_uid
      )
      AND public.has_board_permission(v_board_id, 'board.view')
    )
  ) THEN
    RAISE EXCEPTION 'Нет права редактировать эту карточку.';
  END IF;

  p_title := trim(p_title);
  p_description := coalesce(p_description, '');

  IF char_length(p_title) < 1 OR char_length(p_title) > 200 THEN
    RAISE EXCEPTION 'Название: от 1 до 200 символов.';
  END IF;

  IF char_length(p_description) > 50000 THEN
    RAISE EXCEPTION 'Описание не длиннее 50000 символов.';
  END IF;

  IF v_old_title IS DISTINCT FROM p_title OR v_old_desc IS DISTINCT FROM p_description THEN
    UPDATE public.cards
    SET title = p_title, description = p_description
    WHERE id = p_card_id;
  END IF;

  IF v_old_title IS DISTINCT FROM p_title THEN
    INSERT INTO public.card_activity (
      card_id, actor_user_id, activity_type, message, payload
    ) VALUES (
      p_card_id, v_uid, 'card_renamed', 'Переименована карточка',
      jsonb_build_object('previous_title', v_old_title, 'title', p_title)
    );
  END IF;

  IF v_old_desc IS DISTINCT FROM p_description THEN
    INSERT INTO public.card_activity (
      card_id, actor_user_id, activity_type, message, payload
    ) VALUES (
      p_card_id, v_uid, 'description_updated', 'Изменено описание', '{}'::jsonb
    );
  END IF;

  FOR r_def IN
    SELECT d.id, d.name AS fname, d.field_type, d.is_required
    FROM public.board_field_definitions d
    WHERE d.board_id = v_board_id
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

    SELECT
      cv.text_value,
      cv.date_value,
      cv.link_url,
      cv.link_text,
      cv.select_option_id
    INTO v_ex, v_ex_d, v_ex_u, v_ex_lt, v_ex_opt
    FROM public.card_field_values cv
    WHERE cv.card_id = p_card_id
      AND cv.field_definition_id = v_fid;

    v_date := NULL;
    v_link_url := NULL;
    v_link_text := NULL;
    v_opt := NULL;
    v_disp_old := NULL;
    v_disp_new := NULL;

    IF v_ftype = 'text' THEN
      IF v_elem IS NULL OR v_elem->>'text_value' IS NULL THEN
        v_trim := '';
      ELSE
        v_trim := trim(v_elem->>'text_value');
      END IF;
      IF v_req AND v_trim = '' THEN
        RAISE EXCEPTION 'Заполните обязательное поле «%».', r_fname;
      END IF;
      v_disp_old := coalesce(v_ex, '');
      v_disp_new := v_trim;
      IF v_disp_old IS DISTINCT FROM v_disp_new THEN
        IF v_trim = '' THEN
          DELETE FROM public.card_field_values
          WHERE card_id = p_card_id AND field_definition_id = v_fid;
        ELSIF v_ex IS NULL THEN
          INSERT INTO public.card_field_values (
            card_id, field_definition_id, text_value
          ) VALUES (p_card_id, v_fid, v_trim);
        ELSE
          UPDATE public.card_field_values
          SET text_value = v_trim, date_value = NULL, link_url = NULL,
              link_text = NULL, select_option_id = NULL
          WHERE card_id = p_card_id AND field_definition_id = v_fid;
        END IF;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'text',
            'previous', v_disp_old,
            'next', v_disp_new
          )
        );
      END IF;

    ELSIF v_ftype = 'date' THEN
      IF v_elem IS NULL OR v_elem->>'date_value' IS NULL OR trim(v_elem->>'date_value') = '' THEN
        v_date := NULL;
        v_disp_new := '';
      ELSE
        BEGIN
          v_date := (trim(v_elem->>'date_value'))::date;
          v_disp_new := trim(v_elem->>'date_value');
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Некорректная дата в поле «%».', r_fname;
        END;
      END IF;
      IF v_req AND v_date IS NULL THEN
        RAISE EXCEPTION 'Заполните обязательное поле «%».', r_fname;
      END IF;
      v_disp_old := CASE WHEN v_ex_d IS NULL THEN '' ELSE v_ex_d::text END;

      IF v_ex_d IS NULL AND v_date IS NULL THEN
        NULL;
      ELSIF v_ex_d IS NOT DISTINCT FROM v_date THEN
        NULL;
      ELSIF v_date IS NULL THEN
        DELETE FROM public.card_field_values
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'date',
            'previous', v_disp_old,
            'next', ''
          )
        );
      ELSIF v_ex_d IS NULL THEN
        INSERT INTO public.card_field_values (
          card_id, field_definition_id, date_value
        ) VALUES (p_card_id, v_fid, v_date);
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'date',
            'previous', '',
            'next', v_disp_new
          )
        );
      ELSE
        UPDATE public.card_field_values
        SET text_value = NULL, date_value = v_date, link_url = NULL,
            link_text = NULL, select_option_id = NULL
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'date',
            'previous', v_disp_old,
            'next', v_disp_new
          )
        );
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

      v_disp_old :=
        CASE
          WHEN v_ex_u IS NULL OR v_ex_u = '' THEN ''
          ELSE coalesce(nullif(trim(v_ex_lt), ''), v_ex_u)
        END;
      v_disp_new :=
        CASE
          WHEN v_link_url = '' THEN ''
          ELSE coalesce(v_link_text, v_link_url)
        END;

      IF (v_ex_u IS NULL OR v_ex_u = '')
         AND v_link_url = '' THEN
        NULL;
      ELSIF v_ex_u IS NOT DISTINCT FROM v_link_url
        AND v_ex_lt IS NOT DISTINCT FROM v_link_text THEN
        NULL;
      ELSIF v_link_url = '' THEN
        DELETE FROM public.card_field_values
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'link',
            'previous', jsonb_build_object('url', v_ex_u, 'text', v_ex_lt),
            'next', jsonb_build_object('url', '', 'text', null)
          )
        );
      ELSIF v_ex_u IS NULL OR v_ex_u = '' THEN
        INSERT INTO public.card_field_values (
          card_id, field_definition_id, link_url, link_text
        ) VALUES (p_card_id, v_fid, v_link_url, v_link_text);
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'link',
            'previous', jsonb_build_object('url', '', 'text', null),
            'next', jsonb_build_object('url', v_link_url, 'text', v_link_text)
          )
        );
      ELSE
        UPDATE public.card_field_values
        SET text_value = NULL, date_value = NULL, link_url = v_link_url,
            link_text = v_link_text, select_option_id = NULL
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'link',
            'previous', jsonb_build_object('url', v_ex_u, 'text', v_ex_lt),
            'next', jsonb_build_object('url', v_link_url, 'text', v_link_text)
          )
        );
      END IF;

    ELSIF v_ftype = 'select' THEN
      IF v_elem IS NULL OR v_elem->>'select_option_id' IS NULL
         OR trim(v_elem->>'select_option_id') = '' THEN
        v_opt := NULL;
        v_disp_new := '';
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
        SELECT o.name INTO v_disp_new
        FROM public.board_field_select_options o
        WHERE o.id = v_opt;
      END IF;

      IF v_req AND v_opt IS NULL THEN
        RAISE EXCEPTION 'Выберите значение в поле «%».', r_fname;
      END IF;

      IF v_ex_opt IS NOT NULL THEN
        SELECT o.name INTO v_disp_old
        FROM public.board_field_select_options o
        WHERE o.id = v_ex_opt;
      ELSE
        v_disp_old := '';
      END IF;
      v_disp_old := coalesce(v_disp_old, '');

      IF v_ex_opt IS NULL AND v_opt IS NULL THEN
        NULL;
      ELSIF v_ex_opt IS NOT DISTINCT FROM v_opt THEN
        NULL;
      ELSIF v_opt IS NULL THEN
        DELETE FROM public.card_field_values
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'select',
            'previous', v_disp_old,
            'next', ''
          )
        );
      ELSIF v_ex_opt IS NULL THEN
        INSERT INTO public.card_field_values (
          card_id, field_definition_id, select_option_id
        ) VALUES (p_card_id, v_fid, v_opt);
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'select',
            'previous', '',
            'next', coalesce(v_disp_new, '')
          )
        );
      ELSE
        UPDATE public.card_field_values
        SET text_value = NULL, date_value = NULL, link_url = NULL,
            link_text = NULL, select_option_id = v_opt
        WHERE card_id = p_card_id AND field_definition_id = v_fid;
        INSERT INTO public.card_activity (
          card_id, actor_user_id, activity_type, message, payload
        ) VALUES (
          p_card_id, v_uid, 'field_value_updated',
          format('Изменено поле «%s»', r_fname),
          jsonb_build_object(
            'field_definition_id', v_fid,
            'field_name', r_fname,
            'field_type', 'select',
            'previous', v_disp_old,
            'next', coalesce(v_disp_new, '')
          )
        );
      END IF;

    ELSIF v_ftype = 'yandex_disk' THEN
      -- Файлы в public.card_attachments; значение не хранится в card_field_values.
      NULL;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_card_body_and_custom_fields(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_card_body_and_custom_fields(uuid, text, text, jsonb) TO authenticated;
