-- YDB4.7: привязка вложений к полю типа `yandex_disk` (спец. 7.2, 10.x).
-- Расширение каталога полей до доп. UI (YDB7.1); RLS гарантирует тип на уровне БД.

ALTER TABLE public.board_field_definitions
  DROP CONSTRAINT IF EXISTS board_field_definitions_field_type_check;

ALTER TABLE public.board_field_definitions
  ADD CONSTRAINT board_field_definitions_field_type_check
  CHECK (field_type IN ('link', 'text', 'date', 'select', 'yandex_disk'));

ALTER TABLE public.card_attachments
  ADD COLUMN field_definition_id uuid REFERENCES public.board_field_definitions(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.card_attachments.field_definition_id IS
  'Определение поля доски типа yandex_disk; вложения разделяются по полям (YDB4.7).';

-- Старые строки без поля удаляем (dev/промежуточная схема без колонки).
DELETE FROM public.card_attachments;

ALTER TABLE public.card_attachments
  ALTER COLUMN field_definition_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS card_attachments_field_definition_id_idx
  ON public.card_attachments (field_definition_id);

CREATE INDEX IF NOT EXISTS card_attachments_card_field_ready_idx
  ON public.card_attachments (card_id, field_definition_id)
  WHERE status = 'ready';

-- RLS: INSERT/UPDATE только с согласованным полем доски типа yandex_disk на той же доске, что и карточка.
DROP POLICY IF EXISTS card_attachments_insert_content_edit ON public.card_attachments;
CREATE POLICY card_attachments_insert_content_edit
  ON public.card_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_card_content(card_id)
    AND uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_field_definitions d
        ON d.board_id = c.board_id
       AND d.id = field_definition_id
      WHERE c.id = card_id
        AND d.field_type = 'yandex_disk'
    )
  );

DROP POLICY IF EXISTS card_attachments_update_content_edit ON public.card_attachments;
CREATE POLICY card_attachments_update_content_edit
  ON public.card_attachments
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_card_content(card_id))
  WITH CHECK (
    public.can_edit_card_content(card_id)
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_field_definitions d
        ON d.board_id = c.board_id
       AND d.id = field_definition_id
      WHERE c.id = card_id
        AND d.field_type = 'yandex_disk'
    )
  );

-- Snapshot: в `card_ready_attachments` добавлен `field_definition_id` (группировка по полям, YDB4.7).

CREATE OR REPLACE FUNCTION public.get_board_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_board public.boards%ROWTYPE;
  v_my_role_id uuid;
  v_is_sysadmin boolean := false;
  v_allowed_permissions jsonb := '[]'::jsonb;
  v_card_ids uuid[];
  v_columns jsonb;
  v_cards jsonb;
  v_labels jsonb;
  v_field_definitions jsonb;
  v_preview_items jsonb;
  v_members jsonb;
  v_roles jsonb;
  v_card_assignees jsonb;
  v_card_labels jsonb;
  v_card_field_values jsonb;
  v_comments_count_by_card jsonb;
  v_activity jsonb;
  v_yandex_disk_integration jsonb;
  v_can_see_yandex_disk_integration_details boolean := false;
  v_card_ready_attachments jsonb;

  v_ui_perm_list text[] := ARRAY[
    'board.invite_members',
    'roles.manage',
    'labels.manage',
    'cards.create',
    'cards.edit_any',
    'cards.edit_own',
    'cards.delete_any',
    'cards.delete_own',
    'columns.create',
    'columns.rename',
    'columns.reorder',
    'columns.delete',
    'cards.move',
    'comments.create',
    'comments.edit_own',
    'comments.delete_own',
    'comments.moderate',
    'card_fields.manage',
    'card_preview.manage',
    'board.change_background'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
  INTO v_board
  FROM public.boards b
  WHERE b.id = p_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'board not found';
  END IF;

  v_is_sysadmin := public.is_system_admin(v_uid);

  IF NOT v_is_sysadmin AND NOT public.has_board_permission(v_uid, p_board_id, 'board.view') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_can_see_yandex_disk_integration_details := v_is_sysadmin OR (v_board.owner_user_id = v_uid);

  SELECT bm.board_role_id
  INTO v_my_role_id
  FROM public.board_members bm
  WHERE bm.board_id = p_board_id
    AND bm.user_id = v_uid
  LIMIT 1;

  IF v_is_sysadmin THEN
    SELECT to_jsonb(v_ui_perm_list) INTO v_allowed_permissions;
  ELSIF v_my_role_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(brp.permission ORDER BY brp.permission), '[]'::jsonb)
    INTO v_allowed_permissions
    FROM public.board_role_permissions brp
    WHERE brp.board_role_id = v_my_role_id
      AND brp.allowed = true
      AND brp.permission = ANY (v_ui_perm_list);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'key', br.key,
        'name', br.name
      )
      ORDER BY br.key, br.id
    ),
    '[]'::jsonb
  )
  INTO v_roles
  FROM public.board_roles br
  WHERE br.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', bm.user_id,
        'board_role_id', bm.board_role_id,
        'is_owner', bm.is_owner,
        'display_name', COALESCE(NULLIF(btrim(p.display_name), ''), 'Участник'),
        'email', COALESCE(p.email, ''),
        'avatar_url', p.avatar_url,
        'role_name', COALESCE(br.name, ''),
        'role_key', COALESCE(br.key, '')
      )
      ORDER BY bm.is_owner DESC, COALESCE(NULLIF(btrim(p.display_name), ''), p.email, bm.user_id::text)
    ),
    '[]'::jsonb
  )
  INTO v_members
  FROM public.board_members bm
  LEFT JOIN public.profiles p ON p.user_id = bm.user_id
  LEFT JOIN public.board_roles br ON br.id = bm.board_role_id
  WHERE bm.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bc.id,
        'name', bc.name,
        'column_type', bc.column_type,
        'position', bc.position
      )
      ORDER BY bc.position, bc.id
    ),
    '[]'::jsonb
  )
  INTO v_columns
  FROM public.board_columns bc
  WHERE bc.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'column_id', c.column_id,
        'title', c.title,
        'description', COALESCE(c.description, ''),
        'position', c.position,
        'created_by_user_id', c.created_by_user_id,
        'responsible_user_id', c.responsible_user_id
      )
      ORDER BY c.position, c.id
    ),
    '[]'::jsonb
  )
  INTO v_cards
  FROM public.cards c
  WHERE c.board_id = p_board_id;

  SELECT array_agg(c.id ORDER BY c.id)
  INTO v_card_ids
  FROM public.cards c
  WHERE c.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'color', l.color,
        'position', l.position
      )
      ORDER BY l.position, l.id
    ),
    '[]'::jsonb
  )
  INTO v_labels
  FROM public.labels l
  WHERE l.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'field_type', d.field_type,
        'is_required', d.is_required,
        'position', d.position,
        'select_options',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', o.id,
                  'name', o.name,
                  'color', o.color,
                  'position', o.position
                )
                ORDER BY o.position, o.id
              )
              FROM public.board_field_select_options o
              WHERE o.field_definition_id = d.id
            ),
            '[]'::jsonb
          )
      )
      ORDER BY d.position, d.id
    ),
    '[]'::jsonb
  )
  INTO v_field_definitions
  FROM public.board_field_definitions d
  WHERE d.board_id = p_board_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pi.id,
        'item_type', pi.item_type,
        'field_definition_id', pi.field_definition_id,
        'enabled', pi.enabled,
        'position', pi.position
      )
      ORDER BY pi.position, pi.id
    ),
    '[]'::jsonb
  )
  INTO v_preview_items
  FROM public.board_card_preview_items pi
  WHERE pi.board_id = p_board_id;

  IF v_card_ids IS NULL OR cardinality(v_card_ids) = 0 THEN
    v_card_assignees := '[]'::jsonb;
    v_card_labels := '[]'::jsonb;
    v_card_field_values := '[]'::jsonb;
    v_comments_count_by_card := '{}'::jsonb;
    v_activity := '[]'::jsonb;
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'card_id', ca.card_id,
          'user_id', ca.user_id
        )
        ORDER BY ca.card_id, ca.user_id
      ),
      '[]'::jsonb
    )
    INTO v_card_assignees
    FROM public.card_assignees ca
    WHERE ca.card_id = ANY (v_card_ids);

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'card_id', cl.card_id,
          'label_id', cl.label_id
        )
        ORDER BY cl.card_id, cl.label_id
      ),
      '[]'::jsonb
    )
    INTO v_card_labels
    FROM public.card_labels cl
    WHERE cl.card_id = ANY (v_card_ids);

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'card_id', fv.card_id,
          'field_definition_id', fv.field_definition_id,
          'text_value', fv.text_value,
          'date_value', fv.date_value,
          'link_url', fv.link_url,
          'link_text', fv.link_text,
          'select_option_id', fv.select_option_id
        )
        ORDER BY fv.card_id, fv.field_definition_id
      ),
      '[]'::jsonb
    )
    INTO v_card_field_values
    FROM public.card_field_values fv
    WHERE fv.card_id = ANY (v_card_ids);

    SELECT COALESCE(
      jsonb_object_agg(t.card_id::text, t.cnt),
      '{}'::jsonb
    )
    INTO v_comments_count_by_card
    FROM (
      SELECT cc.card_id, count(*)::int AS cnt
      FROM public.card_comments cc
      WHERE cc.card_id = ANY (v_card_ids)
        AND cc.deleted_at IS NULL
      GROUP BY cc.card_id
    ) AS t;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'card_id', a.card_id,
          'actor_user_id', a.actor_user_id,
          'actor_display_name', COALESCE(NULLIF(btrim(p.display_name), ''), 'Участник'),
          'activity_type', a.activity_type,
          'message', COALESCE(a.message, ''),
          'created_at', a.created_at
        )
        ORDER BY a.created_at DESC, a.id
      ),
      '[]'::jsonb
    )
    INTO v_activity
    FROM public.card_activity a
    LEFT JOIN public.profiles p ON p.user_id = a.actor_user_id
    WHERE a.card_id = ANY (v_card_ids);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'card_id', ca.card_id,
        'field_definition_id', ca.field_definition_id,
        'id', ca.id,
        'original_file_name', ca.original_file_name,
        'mime_type', ca.mime_type,
        'size_bytes', ca.size_bytes,
        'uploaded_at', ca.uploaded_at,
        'uploaded_by_user_id', ca.uploaded_by_user_id
      )
      ORDER BY ca.card_id, ca.field_definition_id, ca.uploaded_at ASC, ca.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_card_ready_attachments
  FROM public.card_attachments ca
  INNER JOIN public.cards c
    ON c.id = ca.card_id
   AND c.board_id = ca.board_id
  WHERE ca.board_id = p_board_id
    AND ca.status = 'ready';

  SELECT jsonb_build_object(
    'status', i.status,
    'yandex_login',
      CASE WHEN v_can_see_yandex_disk_integration_details THEN i.yandex_login ELSE NULL END,
    'root_folder_path',
      CASE WHEN v_can_see_yandex_disk_integration_details THEN i.root_folder_path ELSE NULL END,
    'last_authorized_at',
      CASE WHEN v_can_see_yandex_disk_integration_details THEN i.last_authorized_at ELSE NULL END,
    'last_error_text',
      CASE WHEN v_can_see_yandex_disk_integration_details THEN i.last_error_text ELSE NULL END
  )
  INTO v_yandex_disk_integration
  FROM public.board_yandex_disk_integrations i
  WHERE i.board_id = p_board_id;

  RETURN jsonb_build_object(
    'current_user_id', v_uid,
    'board',
      jsonb_build_object(
        'id', v_board.id,
        'name', v_board.name,
        'background_type', v_board.background_type,
        'background_color', v_board.background_color,
        'background_image_path', v_board.background_image_path
      ),
    'is_system_admin', v_is_sysadmin,
    'my_role_id', v_my_role_id,
    'allowed_permissions', v_allowed_permissions,
    'roles', v_roles,
    'members', v_members,
    'columns', v_columns,
    'cards', v_cards,
    'labels', v_labels,
    'field_definitions', v_field_definitions,
    'preview_items', v_preview_items,
    'card_assignees', v_card_assignees,
    'card_labels', v_card_labels,
    'card_field_values', v_card_field_values,
    'comments_count_by_card', v_comments_count_by_card,
    'activity', v_activity,
    'card_ready_attachments', v_card_ready_attachments,
    'yandex_disk_integration', v_yandex_disk_integration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_board_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_board_snapshot(uuid) IS
  'Aggregated board snapshot for /boards/[boardId]. Includes current_user_id, yandex_disk_integration (no tokens), and card_ready_attachments (ready only, field_definition_id, no storage_path).';
