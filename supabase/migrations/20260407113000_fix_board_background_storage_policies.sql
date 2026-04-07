-- Doit: fix board-backgrounds storage policies (safe uuid parse)

DROP POLICY IF EXISTS board_backgrounds_select ON storage.objects;
CREATE POLICY board_backgrounds_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = (
        CASE
          WHEN split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
            THEN split_part(name, '/', 1)::uuid
          ELSE NULL
        END
      )
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
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = (
        CASE
          WHEN split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
            THEN split_part(name, '/', 1)::uuid
          ELSE NULL
        END
      )
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
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = (
        CASE
          WHEN split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
            THEN split_part(name, '/', 1)::uuid
          ELSE NULL
        END
      )
      AND public.has_board_permission(b.id, 'board.change_background')
    )
  )
  WITH CHECK (
    bucket_id = 'board-backgrounds'
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = (
        CASE
          WHEN split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
            THEN split_part(name, '/', 1)::uuid
          ELSE NULL
        END
      )
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
    AND EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = (
        CASE
          WHEN split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
            THEN split_part(name, '/', 1)::uuid
          ELSE NULL
        END
      )
      AND public.has_board_permission(b.id, 'board.change_background')
    )
  );
