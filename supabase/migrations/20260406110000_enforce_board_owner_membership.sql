-- Doit: C5 — owner membership cannot be removed, role-changed, or demoted (DB enforced).
-- Allows: CASCADE delete when the board is deleted (statement-level marker on boards).
-- Bypass: system admins (public.system_admins) and Supabase service_role.

CREATE UNIQUE INDEX IF NOT EXISTS board_members_one_owner_per_board_idx
  ON public.board_members (board_id)
  WHERE is_owner IS TRUE;

CREATE OR REPLACE FUNCTION public.boards_stmt_mark_member_cascade_delete_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.board_delete_cascade', '1', true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.boards_stmt_mark_member_cascade_delete_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.board_delete_cascade', null, true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS boards_before_delete_stmt_member_cascade ON public.boards;
CREATE TRIGGER boards_before_delete_stmt_member_cascade
  BEFORE DELETE ON public.boards
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.boards_stmt_mark_member_cascade_delete_start();

DROP TRIGGER IF EXISTS boards_after_delete_stmt_member_cascade ON public.boards;
CREATE TRIGGER boards_after_delete_stmt_member_cascade
  AFTER DELETE ON public.boards
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.boards_stmt_mark_member_cascade_delete_end();

CREATE OR REPLACE FUNCTION public.enforce_board_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  in_board_cascade boolean :=
    coalesce(nullif(current_setting('app.board_delete_cascade', true), ''), '') = '1';
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF uid IS NOT NULL AND public.is_system_admin(uid) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner AND NOT in_board_cascade THEN
      RAISE EXCEPTION 'cannot remove board owner from membership';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.is_owner THEN
    IF NEW.is_owner IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'cannot demote board owner';
    END IF;
    IF NEW.board_role_id IS DISTINCT FROM OLD.board_role_id THEN
      RAISE EXCEPTION 'cannot change board role for board owner';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.board_id IS DISTINCT FROM OLD.board_id THEN
      RAISE EXCEPTION 'cannot reassign board owner membership row';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_members_enforce_owner ON public.board_members;
CREATE TRIGGER board_members_enforce_owner
  BEFORE UPDATE OR DELETE ON public.board_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_board_owner_membership();
