-- Doit: RLS for card_activity, Telegram link tokens, notification tables, board_card_preview_items

-- ---------------------------------------------------------------- card_activity
ALTER TABLE public.card_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_activity_select_board_view ON public.card_activity;
CREATE POLICY card_activity_select_board_view
  ON public.card_activity
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_columns bc ON bc.id = c.column_id
      WHERE c.id = card_activity.card_id
        AND public.has_board_permission(bc.board_id, 'board.view')
    )
  );

-- Append-only from clients when the actor is the current user and could legitimately
-- mutate card-related data (workers use service_role and bypass RLS).
DROP POLICY IF EXISTS card_activity_insert_actor_with_permission ON public.card_activity;
CREATE POLICY card_activity_insert_actor_with_permission
  ON public.card_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_columns bc ON bc.id = c.column_id
      WHERE c.id = card_activity.card_id
        AND (
          public.has_board_permission(bc.board_id, 'cards.create')
          OR public.has_board_permission(bc.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(bc.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR public.has_board_permission(bc.board_id, 'cards.move')
          OR public.has_board_permission(bc.board_id, 'cards.delete_any')
          OR (
            public.has_board_permission(bc.board_id, 'cards.delete_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR public.has_board_permission(bc.board_id, 'comments.create')
          OR public.has_board_permission(bc.board_id, 'comments.edit_own')
          OR public.has_board_permission(bc.board_id, 'comments.moderate')
          OR public.has_board_permission(bc.board_id, 'labels.manage')
          OR public.has_board_permission(bc.board_id, 'card_fields.manage')
        )
    )
  );

-- ---------------------------------------------------------------- telegram_link_tokens
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_link_tokens_select_own ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_select_own
  ON public.telegram_link_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS telegram_link_tokens_insert_own ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_insert_own
  ON public.telegram_link_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS telegram_link_tokens_update_own ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_update_own
  ON public.telegram_link_tokens
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

DROP POLICY IF EXISTS telegram_link_tokens_delete_own ON public.telegram_link_tokens;
CREATE POLICY telegram_link_tokens_delete_own
  ON public.telegram_link_tokens
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

-- ---------------------------------------------------------------- notification_outbox (worker / service_role only for clients)
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated: cannot read or mutate outbox rows from the app client.

-- ---------------------------------------------------------------- notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own
  ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own
  ON public.notification_preferences
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

DROP POLICY IF EXISTS notification_preferences_delete_own ON public.notification_preferences;
CREATE POLICY notification_preferences_delete_own
  ON public.notification_preferences
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

-- ---------------------------------------------------------------- notification_user_settings
ALTER TABLE public.notification_user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_user_settings_select_own ON public.notification_user_settings;
CREATE POLICY notification_user_settings_select_own
  ON public.notification_user_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_user_settings_insert_own ON public.notification_user_settings;
CREATE POLICY notification_user_settings_insert_own
  ON public.notification_user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS notification_user_settings_update_own ON public.notification_user_settings;
CREATE POLICY notification_user_settings_update_own
  ON public.notification_user_settings
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

DROP POLICY IF EXISTS notification_user_settings_delete_own ON public.notification_user_settings;
CREATE POLICY notification_user_settings_delete_own
  ON public.notification_user_settings
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

-- ---------------------------------------------------------------- internal_notifications
ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_notifications_select_own ON public.internal_notifications;
CREATE POLICY internal_notifications_select_own
  ON public.internal_notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR user_id = auth.uid()
  );

-- Inserts are performed with service_role (or SECURITY DEFINER); clients only read/update.

DROP POLICY IF EXISTS internal_notifications_update_own ON public.internal_notifications;
CREATE POLICY internal_notifications_update_own
  ON public.internal_notifications
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

-- ---------------------------------------------------------------- board_card_preview_items
ALTER TABLE public.board_card_preview_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_card_preview_items_select_board_view ON public.board_card_preview_items;
CREATE POLICY board_card_preview_items_select_board_view
  ON public.board_card_preview_items
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

DROP POLICY IF EXISTS board_card_preview_items_insert_manage ON public.board_card_preview_items;
CREATE POLICY board_card_preview_items_insert_manage
  ON public.board_card_preview_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'card_preview.manage')
  );

DROP POLICY IF EXISTS board_card_preview_items_update_manage ON public.board_card_preview_items;
CREATE POLICY board_card_preview_items_update_manage
  ON public.board_card_preview_items
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'card_preview.manage')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'card_preview.manage')
  );

DROP POLICY IF EXISTS board_card_preview_items_delete_manage ON public.board_card_preview_items;
CREATE POLICY board_card_preview_items_delete_manage
  ON public.board_card_preview_items
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'card_preview.manage')
  );
