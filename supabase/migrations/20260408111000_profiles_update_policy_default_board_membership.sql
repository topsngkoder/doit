-- Doit: restrict profiles.default_board_id updates to member boards

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (
      public.is_system_admin()
      OR user_id = auth.uid()
    )
    AND (
      public.is_system_admin()
      OR default_board_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.board_members bm
        WHERE bm.board_id = default_board_id
          AND bm.user_id = auth.uid()
      )
    )
  );
