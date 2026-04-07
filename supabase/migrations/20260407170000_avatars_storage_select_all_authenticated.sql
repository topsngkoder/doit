-- Bugfix: all authenticated users can read avatars for board/member UI
-- Keep write permissions strict: only owner can insert/update/delete own avatar object.

DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS avatars_select_authenticated ON storage.objects;

CREATE POLICY avatars_select_authenticated
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
  );
