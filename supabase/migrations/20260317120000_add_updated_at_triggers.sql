-- Doit: keep updated_at fresh on mutable tables

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_boards_updated_at ON public.boards;
CREATE TRIGGER set_boards_updated_at
  BEFORE UPDATE ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_board_invites_updated_at ON public.board_invites;
CREATE TRIGGER set_board_invites_updated_at
  BEFORE UPDATE ON public.board_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_board_columns_updated_at ON public.board_columns;
CREATE TRIGGER set_board_columns_updated_at
  BEFORE UPDATE ON public.board_columns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_cards_updated_at ON public.cards;
CREATE TRIGGER set_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_card_comments_updated_at ON public.card_comments;
CREATE TRIGGER set_card_comments_updated_at
  BEFORE UPDATE ON public.card_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_board_field_definitions_updated_at ON public.board_field_definitions;
CREATE TRIGGER set_board_field_definitions_updated_at
  BEFORE UPDATE ON public.board_field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_card_field_values_updated_at ON public.card_field_values;
CREATE TRIGGER set_card_field_values_updated_at
  BEFORE UPDATE ON public.card_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notification_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER set_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notification_user_settings_updated_at ON public.notification_user_settings;
CREATE TRIGGER set_notification_user_settings_updated_at
  BEFORE UPDATE ON public.notification_user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_board_card_preview_items_updated_at ON public.board_card_preview_items;
CREATE TRIGGER set_board_card_preview_items_updated_at
  BEFORE UPDATE ON public.board_card_preview_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
