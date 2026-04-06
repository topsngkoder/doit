-- Doit: authorization helper functions for RLS

-- Source of truth for system admins (configured in repo / migrations).
-- Populate manually in Supabase SQL editor (or via seed) as needed:
--   insert into public.system_admins (user_id) values ('<uuid>');

CREATE TABLE IF NOT EXISTS public.system_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.system_admins FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_admins TO service_role;

CREATE OR REPLACE FUNCTION public.is_system_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_admins sa
    WHERE sa.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_system_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_board_permission(
  p_user_id uuid,
  p_board_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    public.is_system_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.board_members bm
      JOIN public.board_roles br
        ON br.id = bm.board_role_id
      JOIN public.board_role_permissions brp
        ON brp.board_role_id = br.id
      WHERE bm.user_id = p_user_id
        AND bm.board_id = p_board_id
        AND br.board_id = p_board_id
        AND brp.permission = p_permission
        AND brp.allowed IS TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_board_permission(
  p_board_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.has_board_permission(auth.uid(), p_board_id, p_permission);
$$;

