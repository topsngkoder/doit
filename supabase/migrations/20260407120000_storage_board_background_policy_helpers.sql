-- Doit: make board-backgrounds storage policies robust via security-definer helpers

CREATE OR REPLACE FUNCTION public.background_board_id_from_object_name(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(coalesce(p_name, ''), '/', 1) ~* '^[0-9a-fA-F-]{36}$'
      THEN split_part(p_name, '/', 1)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_board_background_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH x AS (
    SELECT public.background_board_id_from_object_name(p_name) AS board_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM x
    JOIN public.boards b ON b.id = x.board_id
    WHERE b.owner_user_id = auth.uid()
       OR public.has_board_permission(auth.uid(), b.id, 'board.view')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_board_background_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH x AS (
    SELECT public.background_board_id_from_object_name(p_name) AS board_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM x
    JOIN public.boards b ON b.id = x.board_id
    WHERE b.owner_user_id = auth.uid()
       OR public.has_board_permission(auth.uid(), b.id, 'board.change_background')
  );
$$;

DROP POLICY IF EXISTS board_backgrounds_select ON storage.objects;
CREATE POLICY board_backgrounds_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND public.can_read_board_background_object(name)
  );

DROP POLICY IF EXISTS board_backgrounds_insert ON storage.objects;
CREATE POLICY board_backgrounds_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'board-backgrounds'
    AND public.can_write_board_background_object(name)
  );

DROP POLICY IF EXISTS board_backgrounds_update ON storage.objects;
CREATE POLICY board_backgrounds_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND public.can_write_board_background_object(name)
  )
  WITH CHECK (
    bucket_id = 'board-backgrounds'
    AND public.can_write_board_background_object(name)
  );

DROP POLICY IF EXISTS board_backgrounds_delete ON storage.objects;
CREATE POLICY board_backgrounds_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'board-backgrounds'
    AND public.can_write_board_background_object(name)
  );
