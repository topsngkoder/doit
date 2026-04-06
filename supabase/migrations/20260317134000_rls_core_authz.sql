-- Doit: RLS core authz policies (boards/members/roles/profiles)

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_shared_board ON public.profiles;
CREATE POLICY profiles_select_own_or_shared_board
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.board_members me
      JOIN public.board_members them
        ON them.board_id = me.board_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = profiles.user_id
    )
  );

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
    public.is_system_admin()
    OR user_id = auth.uid()
  );

-- BOARDS
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boards_select_by_permission ON public.boards;
CREATE POLICY boards_select_by_permission
  ON public.boards
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(id, 'board.view')
  );

DROP POLICY IF EXISTS boards_update_by_permission ON public.boards;
CREATE POLICY boards_update_by_permission
  ON public.boards
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(id, 'board.rename')
    OR public.has_board_permission(id, 'board.change_background')
  )
  WITH CHECK (
    public.has_board_permission(id, 'board.rename')
    OR public.has_board_permission(id, 'board.change_background')
  );

-- BOARD MEMBERS
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_members_select_board_view ON public.board_members;
CREATE POLICY board_members_select_board_view
  ON public.board_members
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

-- BOARD ROLES
ALTER TABLE public.board_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_roles_select_board_view ON public.board_roles;
CREATE POLICY board_roles_select_board_view
  ON public.board_roles
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

DROP POLICY IF EXISTS board_roles_insert_roles_manage ON public.board_roles;
CREATE POLICY board_roles_insert_roles_manage
  ON public.board_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'roles.manage')
  );

DROP POLICY IF EXISTS board_roles_update_roles_manage ON public.board_roles;
CREATE POLICY board_roles_update_roles_manage
  ON public.board_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'roles.manage')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'roles.manage')
  );

DROP POLICY IF EXISTS board_roles_delete_roles_manage ON public.board_roles;
CREATE POLICY board_roles_delete_roles_manage
  ON public.board_roles
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'roles.manage')
  );

-- BOARD ROLE PERMISSIONS
ALTER TABLE public.board_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_role_permissions_select_board_view ON public.board_role_permissions;
CREATE POLICY board_role_permissions_select_board_view
  ON public.board_role_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_role_permissions.board_role_id
        AND public.has_board_permission(br.board_id, 'board.view')
    )
  );

DROP POLICY IF EXISTS board_role_permissions_insert_roles_manage ON public.board_role_permissions;
CREATE POLICY board_role_permissions_insert_roles_manage
  ON public.board_role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_role_permissions.board_role_id
        AND public.has_board_permission(br.board_id, 'roles.manage')
    )
  );

DROP POLICY IF EXISTS board_role_permissions_update_roles_manage ON public.board_role_permissions;
CREATE POLICY board_role_permissions_update_roles_manage
  ON public.board_role_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_role_permissions.board_role_id
        AND public.has_board_permission(br.board_id, 'roles.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_role_permissions.board_role_id
        AND public.has_board_permission(br.board_id, 'roles.manage')
    )
  );

DROP POLICY IF EXISTS board_role_permissions_delete_roles_manage ON public.board_role_permissions;
CREATE POLICY board_role_permissions_delete_roles_manage
  ON public.board_role_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.board_roles br
      WHERE br.id = board_role_permissions.board_role_id
        AND public.has_board_permission(br.board_id, 'roles.manage')
    )
  );

