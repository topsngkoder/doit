-- Doit: D1 — atomically create board with preset roles, permissions, columns, preview (14.4.3, 14.5.6, 6.6).

CREATE OR REPLACE FUNCTION public.create_board_with_defaults(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_board_id uuid;
  v_name text := btrim(p_name);
  v_role_viewer uuid;
  v_role_editor uuid;
  v_role_basic uuid;
  v_role_admin uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF v_name = '' OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid board name';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile required';
  END IF;

  INSERT INTO public.boards (name, owner_user_id, background_type, background_color, background_image_path)
  VALUES (v_name, v_uid, 'color', '#F5F5F5', NULL)
  RETURNING id INTO v_board_id;

  INSERT INTO public.board_roles (board_id, key, name) VALUES (v_board_id, 'viewer', 'Только просмотр')
  RETURNING id INTO v_role_viewer;
  INSERT INTO public.board_roles (board_id, key, name) VALUES (v_board_id, 'editor', 'Редактор')
  RETURNING id INTO v_role_editor;
  INSERT INTO public.board_roles (board_id, key, name) VALUES (v_board_id, 'basic', 'Базовая')
  RETURNING id INTO v_role_basic;
  INSERT INTO public.board_roles (board_id, key, name) VALUES (v_board_id, 'board_admin', 'Администратор доски')
  RETURNING id INTO v_role_admin;

  INSERT INTO public.board_role_permissions (board_role_id, permission, allowed)
  SELECT v_role_viewer, p, true
  FROM unnest(ARRAY[
    'board.view'::text
  ]) AS p;

  INSERT INTO public.board_role_permissions (board_role_id, permission, allowed)
  SELECT v_role_editor, p, true
  FROM unnest(ARRAY[
    'board.view',
    'columns.create',
    'columns.rename',
    'columns.reorder',
    'cards.create',
    'cards.edit_own',
    'cards.move',
    'cards.delete_own',
    'comments.create',
    'comments.edit_own',
    'comments.delete_own'
  ]) AS p;

  INSERT INTO public.board_role_permissions (board_role_id, permission, allowed)
  SELECT v_role_basic, p, true
  FROM unnest(ARRAY[
    'board.view',
    'columns.create',
    'columns.rename',
    'columns.reorder',
    'cards.create',
    'cards.edit_own',
    'cards.move',
    'cards.delete_own',
    'comments.create',
    'comments.edit_own',
    'comments.delete_own'
  ]) AS p;

  INSERT INTO public.board_role_permissions (board_role_id, permission, allowed)
  SELECT v_role_admin, p, true
  FROM unnest(ARRAY[
    'board.view',
    'board.rename',
    'board.change_background',
    'board.invite_members',
    'board.remove_members',
    'roles.manage',
    'columns.create',
    'columns.rename',
    'columns.reorder',
    'columns.delete',
    'cards.create',
    'cards.edit_own',
    'cards.edit_any',
    'cards.move',
    'cards.delete_own',
    'cards.delete_any',
    'card_fields.manage',
    'labels.manage',
    'card_preview.manage',
    'comments.create',
    'comments.edit_own',
    'comments.delete_own',
    'comments.moderate'
  ]) AS p;

  INSERT INTO public.board_members (board_id, user_id, board_role_id, is_owner)
  VALUES (v_board_id, v_uid, v_role_admin, true);

  INSERT INTO public.board_columns (board_id, name, column_type, position) VALUES
    (v_board_id, 'Очередь', 'queue', 1000),
    (v_board_id, 'В работе', 'in_work', 2000),
    (v_board_id, 'Готово', 'done', 3000),
    (v_board_id, 'Информационный', 'info', 4000);

  INSERT INTO public.board_card_preview_items (board_id, item_type, field_definition_id, enabled, position) VALUES
    (v_board_id, 'title', NULL, true, 1000),
    (v_board_id, 'assignees', NULL, true, 2000),
    (v_board_id, 'comments_count', NULL, true, 3000),
    (v_board_id, 'labels', NULL, true, 4000);

  RETURN v_board_id;
END;
$$;

COMMENT ON FUNCTION public.create_board_with_defaults(text) IS
  'Creates boards row, 4 preset roles with MVP permission matrix, owner membership, 4 default columns (14.4.3), default preview items (14.5.6).';

GRANT EXECUTE ON FUNCTION public.create_board_with_defaults(text) TO authenticated;
