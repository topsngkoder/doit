-- Doit: query indexes for key board/card/notification flows

CREATE INDEX IF NOT EXISTS boards_owner_user_id_idx
  ON public.boards (owner_user_id);

CREATE INDEX IF NOT EXISTS board_roles_board_id_idx
  ON public.board_roles (board_id);

CREATE INDEX IF NOT EXISTS board_members_user_id_board_id_idx
  ON public.board_members (user_id, board_id);

CREATE INDEX IF NOT EXISTS board_invites_pending_email_idx
  ON public.board_invites (lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS board_columns_board_id_position_idx
  ON public.board_columns (board_id, position);

CREATE INDEX IF NOT EXISTS cards_board_id_idx
  ON public.cards (board_id);

CREATE INDEX IF NOT EXISTS cards_column_id_position_idx
  ON public.cards (column_id, position);

CREATE INDEX IF NOT EXISTS cards_responsible_user_id_idx
  ON public.cards (responsible_user_id)
  WHERE responsible_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_assignees_user_id_card_id_idx
  ON public.card_assignees (user_id, card_id);

CREATE INDEX IF NOT EXISTS labels_board_id_position_idx
  ON public.labels (board_id, position);

CREATE INDEX IF NOT EXISTS card_comments_card_id_created_at_idx
  ON public.card_comments (card_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS board_field_definitions_board_id_position_idx
  ON public.board_field_definitions (board_id, position);

CREATE INDEX IF NOT EXISTS board_field_select_options_field_definition_id_position_idx
  ON public.board_field_select_options (field_definition_id, position);

CREATE INDEX IF NOT EXISTS card_field_values_field_definition_id_idx
  ON public.card_field_values (field_definition_id);

CREATE INDEX IF NOT EXISTS card_activity_card_id_created_at_idx
  ON public.card_activity (card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_id_created_at_idx
  ON public.telegram_link_tokens (user_id, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS notification_outbox_pending_next_attempt_at_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS internal_notifications_user_id_read_at_created_at_idx
  ON public.internal_notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS board_card_preview_items_board_id_position_idx
  ON public.board_card_preview_items (board_id, position);
