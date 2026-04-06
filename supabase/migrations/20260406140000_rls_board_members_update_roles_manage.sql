-- E4: allow updating member roles when caller has roles.manage; only board_role_id may change (non–service_role).

CREATE OR REPLACE FUNCTION public.board_members_restrict_update_to_role_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF uid IS NOT NULL AND public.is_system_admin(uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.board_id IS DISTINCT FROM OLD.board_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_owner IS DISTINCT FROM OLD.is_owner
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'board_members update may only change board_role_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_members_a_restrict_update_to_role_only ON public.board_members;
CREATE TRIGGER board_members_a_restrict_update_to_role_only
  BEFORE UPDATE ON public.board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.board_members_restrict_update_to_role_only();

DROP POLICY IF EXISTS board_members_update_roles_manage ON public.board_members;
CREATE POLICY board_members_update_roles_manage
  ON public.board_members
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'roles.manage')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'roles.manage')
    AND EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_members.board_role_id
        AND br.board_id = board_members.board_id
    )
  );
