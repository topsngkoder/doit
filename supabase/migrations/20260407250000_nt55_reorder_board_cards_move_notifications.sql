-- NT5.5: Уведомления при межколоночном перемещении (spec §4.4–4.6, §5): ровно один из
-- card_ready | card_in_progress | card_moved за одно перемещение; смена только порядка в колонке — без уведомления.

CREATE OR REPLACE FUNCTION public.reorder_board_cards(p_board_id uuid, p_layout jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r_col jsonb;
  v_col_id uuid;
  v_card_id uuid;
  v_cards jsonb;
  v_idx int;
  v_board_col_ids uuid[];
  v_layout_col_ids uuid[] := ARRAY[]::uuid[];
  v_map jsonb := '{}'::jsonb;
  v_db_card_ids uuid[];
  v_map_keys uuid[];
  v_old public.cards%ROWTYPE;
  v_new_col uuid;
  v_new_pos int;
  v_col_changed boolean;
  v_col_types jsonb := '{}'::jsonb;
  v_col_names jsonb := '{}'::jsonb;
  v_board_name text;
  v_actor_display text;
  v_set_responsible boolean;
  v_from_type text;
  v_to_type text;
  v_event_type text;
  v_notify_body text;
  v_notify_link text;
  v_from_col_name text;
  v_to_col_name text;
  v_card_title_display text;
  r_assignee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  IF p_layout IS NULL OR jsonb_typeof(p_layout) != 'array' OR jsonb_array_length(p_layout) = 0 THEN
    RAISE EXCEPTION 'Некорректный layout (ожидается непустой массив).';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(bc.id::text, to_jsonb(bc.column_type)),
    '{}'::jsonb
  )
  INTO v_col_types
  FROM public.board_columns bc
  WHERE bc.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_object_agg(bc.id::text, to_jsonb(bc.name)),
    '{}'::jsonb
  )
  INTO v_col_names
  FROM public.board_columns bc
  WHERE bc.board_id = p_board_id;

  SELECT COALESCE(NULLIF(trim(b.name), ''), 'Доска')
  INTO v_board_name
  FROM public.boards b
  WHERE b.id = p_board_id;

  IF v_board_name IS NULL THEN
    v_board_name := 'Доска';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(p.email, '@', 1),
    'Участник'
  )
  INTO v_actor_display
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF v_actor_display IS NULL THEN
    v_actor_display := 'Участник';
  END IF;

  SELECT ARRAY(
    SELECT bc.id
    FROM public.board_columns bc
    WHERE bc.board_id = p_board_id
    ORDER BY bc.position, bc.id
  )
  INTO v_board_col_ids;

  IF v_board_col_ids IS NULL OR cardinality(v_board_col_ids) = 0 THEN
    RAISE EXCEPTION 'На доске нет колонок.';
  END IF;

  FOR r_col IN SELECT value FROM jsonb_array_elements(p_layout) AS t(value)
  LOOP
    BEGIN
      v_col_id := NULLIF(trim(r_col->>'column_id'), '')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'Некорректный column_id в layout.';
    END;

    IF v_col_id IS NULL THEN
      RAISE EXCEPTION 'В элементе layout отсутствует column_id.';
    END IF;

    IF NOT (v_col_id = ANY (v_board_col_ids)) THEN
      RAISE EXCEPTION 'Колонка не принадлежит этой доске.';
    END IF;

    IF v_col_id = ANY (v_layout_col_ids) THEN
      RAISE EXCEPTION 'Колонка % в layout встречается более одного раза.', v_col_id;
    END IF;

    v_layout_col_ids := array_append(v_layout_col_ids, v_col_id);

    v_cards := r_col->'card_ids';
    IF v_cards IS NULL OR jsonb_typeof(v_cards) != 'array' THEN
      RAISE EXCEPTION 'Ожидается массив card_ids для колонки %.', v_col_id;
    END IF;

    v_idx := 0;
    FOR v_card_id IN
      SELECT (trim(val))::uuid
      FROM jsonb_array_elements_text(v_cards) AS t(val)
    LOOP
      IF v_map ? (v_card_id::text) THEN
        RAISE EXCEPTION 'Карточка % указана в layout больше одного раза.', v_card_id;
      END IF;

      v_map :=
        v_map
        || jsonb_build_object(
          v_card_id::text,
          jsonb_build_object(
            'column_id',
            v_col_id::text,
            'position',
            v_idx
          )
        );
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;

  IF (
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    FROM unnest(v_layout_col_ids) AS x
  ) IS DISTINCT FROM (
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    FROM unnest(v_board_col_ids) AS x
  ) THEN
    RAISE EXCEPTION 'В layout должны участвовать ровно все колонки доски.';
  END IF;

  SELECT COALESCE(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[])
  INTO v_db_card_ids
  FROM public.cards c
  WHERE c.board_id = p_board_id;

  SELECT COALESCE(array_agg((k)::uuid ORDER BY k), ARRAY[]::uuid[])
  INTO v_map_keys
  FROM jsonb_object_keys(v_map) AS k;

  IF v_db_card_ids IS DISTINCT FROM v_map_keys THEN
    RAISE EXCEPTION 'Состав card_ids в layout должен в точности совпадать с карточками доски.';
  END IF;

  FOR v_old IN
    SELECT *
    FROM public.cards
    WHERE board_id = p_board_id
    FOR UPDATE
  LOOP
    v_new_col := (v_map -> v_old.id::text ->> 'column_id')::uuid;
    v_new_pos := (v_map -> v_old.id::text ->> 'position')::int;
    v_col_changed := v_old.column_id IS DISTINCT FROM v_new_col;
    v_set_responsible :=
      v_col_changed
      AND (v_col_types ->> v_new_col::text) = 'in_work';

    IF
      v_old.column_id IS NOT DISTINCT FROM v_new_col
      AND v_old.position::int IS NOT DISTINCT FROM v_new_pos
    THEN
      CONTINUE;
    END IF;

    IF
      NOT public.is_system_admin(v_uid)
      AND NOT public.has_board_permission(v_uid, p_board_id, 'cards.edit_any')
      AND NOT (
        public.has_board_permission(v_uid, p_board_id, 'cards.edit_own')
        AND v_old.created_by_user_id = v_uid
      )
      AND NOT public.has_board_permission(v_uid, p_board_id, 'cards.move')
    THEN
      RAISE EXCEPTION 'Нет права перемещать карточку %.', v_old.id;
    END IF;

    IF v_set_responsible THEN
      INSERT INTO public.card_assignees (card_id, user_id)
      VALUES (v_old.id, v_uid)
      ON CONFLICT (card_id, user_id) DO NOTHING;
    END IF;

    UPDATE public.cards
    SET
      column_id = v_new_col,
      position = v_new_pos::double precision,
      moved_to_column_at = CASE
        WHEN v_col_changed THEN now()
        ELSE moved_to_column_at
      END,
      responsible_user_id = CASE
        WHEN v_set_responsible THEN v_uid
        ELSE responsible_user_id
      END
    WHERE id = v_old.id;

    INSERT INTO public.card_activity (
      card_id,
      actor_user_id,
      activity_type,
      message,
      payload
    ) VALUES (
      v_old.id,
      v_uid,
      'card_moved',
      CASE
        WHEN v_col_changed THEN 'Карточка перемещена в другую колонку'
        ELSE 'Изменён порядок карточки в колонке'
      END,
      jsonb_build_object(
        'from_column_id',
        v_old.column_id,
        'to_column_id',
        v_new_col,
        'from_position',
        v_old.position,
        'to_position',
        v_new_pos
      )
    );

    IF v_set_responsible THEN
      INSERT INTO public.card_activity (
        card_id,
        actor_user_id,
        activity_type,
        message,
        payload
      ) VALUES (
        v_old.id,
        v_uid,
        'responsible_auto_set',
        'Назначен ответственный: ' || v_actor_display,
        jsonb_build_object(
          'responsible_user_id',
          v_uid,
          'column_id',
          v_new_col
        )
      );
    END IF;

    IF v_col_changed THEN
      v_from_type := v_col_types ->> v_old.column_id::text;
      v_to_type := v_col_types ->> v_new_col::text;

      IF v_to_type = 'done' AND v_from_type IS DISTINCT FROM 'done' THEN
        v_event_type := 'card_ready';
      ELSIF v_to_type = 'in_work' AND v_from_type IS DISTINCT FROM 'in_work' THEN
        v_event_type := 'card_in_progress';
      ELSE
        v_event_type := 'card_moved';
      END IF;

      v_from_col_name := COALESCE(v_col_names ->> v_old.column_id::text, '—');
      v_to_col_name := COALESCE(v_col_names ->> v_new_col::text, '—');
      v_card_title_display := COALESCE(NULLIF(trim(v_old.title), ''), 'Без названия');

      v_notify_link := format('/boards/%s?card=%s', p_board_id::text, v_old.id::text);

      IF v_event_type = 'card_ready' THEN
        v_notify_body := format(
          E'Карточка «%s» на доске «%s» отмечена как готова (колонка «%s»).\nАвтор: %s.',
          v_card_title_display,
          v_board_name,
          v_to_col_name,
          v_actor_display
        );
      ELSIF v_event_type = 'card_in_progress' THEN
        v_notify_body := format(
          E'Карточка «%s» на доске «%s» переведена в работу (колонка «%s»).\nАвтор: %s.',
          v_card_title_display,
          v_board_name,
          v_to_col_name,
          v_actor_display
        );
      ELSE
        v_notify_body := format(
          E'Карточка «%s» на доске «%s» перемещена из колонки «%s» в «%s».\nАвтор: %s.',
          v_card_title_display,
          v_board_name,
          v_from_col_name,
          v_to_col_name,
          v_actor_display
        );
      END IF;

      FOR r_assignee IN
        SELECT ca.user_id
        FROM public.card_assignees ca
        WHERE ca.card_id = v_old.id
      LOOP
        PERFORM public.enqueue_notification_event(
          r_assignee,
          v_event_type,
          v_uid,
          p_board_id,
          v_old.id,
          v_notify_body,
          v_notify_link
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_board_cards(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_board_cards(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.reorder_board_cards(uuid, jsonb) IS
'F7: DnD карточек; авто-ответственный в in_work. NT5.5: при смене column_id — один из card_ready / card_in_progress / card_moved по spec §5; порядок в колонке — без уведомления.';
