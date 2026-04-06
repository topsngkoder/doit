-- Doit: RLS for card_assignees

ALTER TABLE public.card_assignees ENABLE ROW LEVEL SECURITY;

-- View assignees if you can view the board that owns the card.
DROP POLICY IF EXISTS card_assignees_select_board_view ON public.card_assignees;
CREATE POLICY card_assignees_select_board_view
  ON public.card_assignees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_assignees.card_id
        AND public.has_board_permission(c.board_id, 'board.view')
    )
  );

-- Add assignee: allowed if user can edit card participants (edit_any OR (edit_own AND creator)).
-- Also enforce that the assignee is a member of the board.
DROP POLICY IF EXISTS card_assignees_insert_edit_any_or_own ON public.card_assignees;
CREATE POLICY card_assignees_insert_edit_any_or_own
  ON public.card_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_assignees.card_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.board_members bm
          WHERE bm.board_id = c.board_id
            AND bm.user_id = card_assignees.user_id
        )
    )
  );

-- Remove assignee: same rule as insert.
-- Note: "minimum 1 assignee" constraint is enforced at app/RPC layer (see EPIC G rules).
DROP POLICY IF EXISTS card_assignees_delete_edit_any_or_own ON public.card_assignees;
CREATE POLICY card_assignees_delete_edit_any_or_own
  ON public.card_assignees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_assignees.card_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
        )
    )
  );

