-- Doit: RLS for cards (select + insert only; update/delete handled later)

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- View cards if you can view the board.
DROP POLICY IF EXISTS cards_select_board_view ON public.cards;
CREATE POLICY cards_select_board_view
  ON public.cards
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

-- Create cards: requires cards.create; creator must be current user (unless sysadmin);
-- and the column must belong to the same board.
DROP POLICY IF EXISTS cards_insert_cards_create ON public.cards;
CREATE POLICY cards_insert_cards_create
  ON public.cards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'cards.create')
    AND (
      public.is_system_admin()
      OR created_by_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.board_columns bc
      WHERE bc.id = cards.column_id
        AND bc.board_id = cards.board_id
    )
  );

