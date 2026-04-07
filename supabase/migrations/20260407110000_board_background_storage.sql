-- Doit: board backgrounds in Supabase Storage

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-backgrounds',
  'board-backgrounds',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS board_backgrounds_select ON storage.objects;
CREATE POLICY board_backgrounds_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = split_part(name, '/', 1)::uuid
        AND public.has_board_permission(b.id, 'board.view')
    )
  );

DROP POLICY IF EXISTS board_backgrounds_insert ON storage.objects;
CREATE POLICY board_backgrounds_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'board-backgrounds'
    AND split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = split_part(name, '/', 1)::uuid
        AND public.has_board_permission(b.id, 'board.change_background')
    )
  );

DROP POLICY IF EXISTS board_backgrounds_update ON storage.objects;
CREATE POLICY board_backgrounds_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = split_part(name, '/', 1)::uuid
        AND public.has_board_permission(b.id, 'board.change_background')
    )
  )
  WITH CHECK (
    bucket_id = 'board-backgrounds'
    AND split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = split_part(name, '/', 1)::uuid
        AND public.has_board_permission(b.id, 'board.change_background')
    )
  );

DROP POLICY IF EXISTS board_backgrounds_delete ON storage.objects;
CREATE POLICY board_backgrounds_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = split_part(name, '/', 1)::uuid
        AND public.has_board_permission(b.id, 'board.change_background')
    )
  );
