-- Doit: запрет удаления последней колонки на доске

CREATE OR REPLACE FUNCTION public.prevent_last_board_column_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_columns_count bigint;
BEGIN
  SELECT count(*)
  INTO v_columns_count
  FROM public.board_columns bc
  WHERE bc.board_id = OLD.board_id;

  IF v_columns_count <= 1 THEN
    RAISE EXCEPTION 'Нельзя удалить последнюю колонку на доске.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_board_column_delete ON public.board_columns;

CREATE TRIGGER trg_prevent_last_board_column_delete
BEFORE DELETE ON public.board_columns
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_board_column_delete();
