-- Doit: RLS for card_comments (select + insert only; update/delete handled later)

ALTER TABLE public.card_comments ENABLE ROW LEVEL SECURITY;

-- View comments if you can view the board that owns the card.
DROP POLICY IF EXISTS card_comments_select_board_view ON public.card_comments;
CREATE POLICY card_comments_select_board_view
  ON public.card_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_comments.card_id
        AND public.has_board_permission(c.board_id, 'board.view')
    )
  );

-- Create comment: requires comments.create; author must be current user (unless sysadmin).
DROP POLICY IF EXISTS card_comments_insert_comments_create ON public.card_comments;
CREATE POLICY card_comments_insert_comments_create
  ON public.card_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_comments.card_id
        AND public.has_board_permission(c.board_id, 'comments.create')
    )
    AND (
      public.is_system_admin()
      OR author_user_id = auth.uid()
    )
  );

