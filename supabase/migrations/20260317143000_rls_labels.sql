-- Doit: RLS for labels + card_labels

-- LABELS (board-scoped catalog)
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labels_select_board_view ON public.labels;
CREATE POLICY labels_select_board_view
  ON public.labels
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

DROP POLICY IF EXISTS labels_insert_labels_manage ON public.labels;
CREATE POLICY labels_insert_labels_manage
  ON public.labels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'labels.manage')
  );

DROP POLICY IF EXISTS labels_update_labels_manage ON public.labels;
CREATE POLICY labels_update_labels_manage
  ON public.labels
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'labels.manage')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'labels.manage')
  );

DROP POLICY IF EXISTS labels_delete_labels_manage ON public.labels;
CREATE POLICY labels_delete_labels_manage
  ON public.labels
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'labels.manage')
  );

-- CARD_LABELS (card-scoped assignment)
ALTER TABLE public.card_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_labels_select_board_view ON public.card_labels;
CREATE POLICY card_labels_select_board_view
  ON public.card_labels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_labels.card_id
        AND public.has_board_permission(c.board_id, 'board.view')
    )
  );

-- Add label to card: requires card edit permission, and label must belong to the same board as the card.
DROP POLICY IF EXISTS card_labels_insert_edit_any_or_own ON public.card_labels;
CREATE POLICY card_labels_insert_edit_any_or_own
  ON public.card_labels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.labels l
        ON l.id = card_labels.label_id
      WHERE c.id = card_labels.card_id
        AND l.board_id = c.board_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
        )
    )
  );

-- Remove label from card: same rule as insert.
DROP POLICY IF EXISTS card_labels_delete_edit_any_or_own ON public.card_labels;
CREATE POLICY card_labels_delete_edit_any_or_own
  ON public.card_labels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.labels l
        ON l.id = card_labels.label_id
      WHERE c.id = card_labels.card_id
        AND l.board_id = c.board_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
        )
    )
  );

