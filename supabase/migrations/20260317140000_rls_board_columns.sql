-- Doit: RLS for board_columns

ALTER TABLE public.board_columns ENABLE ROW LEVEL SECURITY;

-- View columns if you can view the board.
DROP POLICY IF EXISTS board_columns_select_board_view ON public.board_columns;
CREATE POLICY board_columns_select_board_view
  ON public.board_columns
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

-- Create columns.
DROP POLICY IF EXISTS board_columns_insert_columns_create ON public.board_columns;
CREATE POLICY board_columns_insert_columns_create
  ON public.board_columns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'columns.create')
  );

-- Update columns: rename and reorder share the same UPDATE operation.
DROP POLICY IF EXISTS board_columns_update_rename_or_reorder ON public.board_columns;
CREATE POLICY board_columns_update_rename_or_reorder
  ON public.board_columns
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'columns.rename')
    OR public.has_board_permission(board_id, 'columns.reorder')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'columns.rename')
    OR public.has_board_permission(board_id, 'columns.reorder')
  );

-- Delete columns.
DROP POLICY IF EXISTS board_columns_delete_columns_delete ON public.board_columns;
CREATE POLICY board_columns_delete_columns_delete
  ON public.board_columns
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'columns.delete')
  );

