-- Doit: RLS for board_invites

ALTER TABLE public.board_invites ENABLE ROW LEVEL SECURITY;

-- Only users who can invite members may view invites for the board.
DROP POLICY IF EXISTS board_invites_select_invite_members ON public.board_invites;
CREATE POLICY board_invites_select_invite_members
  ON public.board_invites
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.invite_members')
  );

-- Create invite: requires invite permission; invited_by must be current user (unless sysadmin).
DROP POLICY IF EXISTS board_invites_insert_invite_members ON public.board_invites;
CREATE POLICY board_invites_insert_invite_members
  ON public.board_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'board.invite_members')
    AND (
      public.is_system_admin()
      OR invited_by_user_id = auth.uid()
    )
  );

-- Update invites (e.g., cancel): requires invite permission.
DROP POLICY IF EXISTS board_invites_update_invite_members ON public.board_invites;
CREATE POLICY board_invites_update_invite_members
  ON public.board_invites
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.invite_members')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'board.invite_members')
  );

-- Delete invites: requires invite permission.
DROP POLICY IF EXISTS board_invites_delete_invite_members ON public.board_invites;
CREATE POLICY board_invites_delete_invite_members
  ON public.board_invites
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.invite_members')
  );

