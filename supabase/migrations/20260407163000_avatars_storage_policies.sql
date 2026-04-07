-- PC2.2: avatars storage policies with strict object path <auth.uid()>/avatar.jpg

CREATE OR REPLACE FUNCTION public.avatar_owner_id_from_object_name(p_name text)
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

CREATE OR REPLACE FUNCTION public.is_valid_avatar_object_for_user(p_name text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH x AS (
    SELECT public.avatar_owner_id_from_object_name(p_name) AS owner_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM x
    WHERE x.owner_id IS NOT NULL
      AND x.owner_id = p_user_id
      AND split_part(coalesce(p_name, ''), '/', 2) = 'avatar.jpg'
      AND split_part(coalesce(p_name, ''), '/', 3) = ''
  );
$$;

DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
CREATE POLICY avatars_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.is_valid_avatar_object_for_user(name, auth.uid())
  );

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_valid_avatar_object_for_user(name, auth.uid())
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.is_valid_avatar_object_for_user(name, auth.uid())
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_valid_avatar_object_for_user(name, auth.uid())
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.is_valid_avatar_object_for_user(name, auth.uid())
  );

