-- Doit: allow board delete only for owner or system admin

DROP POLICY IF EXISTS boards_delete_owner_or_admin ON public.boards;
CREATE POLICY boards_delete_owner_or_admin
  ON public.boards
  FOR DELETE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_system_admin()
  );
