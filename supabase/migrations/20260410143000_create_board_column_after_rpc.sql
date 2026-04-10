-- Doit: RPC для создания колонки относительно исходной колонки

CREATE OR REPLACE FUNCTION public.create_board_column_after(
  p_board_id uuid,
  p_source_column_id uuid,
  p_name text,
  p_column_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_column_id uuid;
  v_source_position double precision;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  IF NOT public.has_board_permission(p_board_id, 'columns.create') THEN
    RAISE EXCEPTION 'Нет права создавать колонки на этой доске.';
  END IF;

  p_name := trim(p_name);
  IF char_length(p_name) < 1 THEN
    RAISE EXCEPTION 'Укажите название колонки.';
  END IF;
  IF char_length(p_name) > 50 THEN
    RAISE EXCEPTION 'Название не длиннее 50 символов.';
  END IF;

  IF p_column_type NOT IN ('queue', 'in_work', 'done', 'info') THEN
    RAISE EXCEPTION 'Выберите тип колонки.';
  END IF;

  IF p_source_column_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.board_columns bc
    WHERE bc.id = p_source_column_id
      AND bc.board_id = p_board_id
  ) THEN
    RAISE EXCEPTION 'Колонка не найдена на этой доске.';
  END IF;

  SELECT bc.position
  INTO v_source_position
  FROM public.board_columns bc
  WHERE bc.id = p_source_column_id
    AND bc.board_id = p_board_id
  FOR UPDATE;

  UPDATE public.board_columns
  SET position = position + 1
  WHERE board_id = p_board_id
    AND position > v_source_position;

  INSERT INTO public.board_columns (
    board_id,
    name,
    column_type,
    position
  ) VALUES (
    p_board_id,
    p_name,
    p_column_type,
    v_source_position + 1
  )
  RETURNING id INTO v_new_column_id;

  RETURN v_new_column_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_board_column_after(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_board_column_after(uuid, uuid, text, text) TO authenticated;
