-- Doit: initial schema (section 11)
-- All id UUID, created_at/updated_at timestamptz, UTC.

-- 11.1 profiles (references auth.users)
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  telegram_chat_id bigint UNIQUE,
  telegram_username text,
  telegram_linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 11.2 boards
CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  background_type text NOT NULL CHECK (background_type IN ('color', 'image')),
  background_color text,
  background_image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boards_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  CONSTRAINT boards_background_color_hex CHECK (
    background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT boards_background_check CHECK (
    (background_type = 'color' AND background_color IS NOT NULL AND background_image_path IS NULL) OR
    (background_type = 'image' AND background_image_path IS NOT NULL AND background_color IS NULL)
  )
);

-- 11.3 board_roles
CREATE TABLE public.board_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, key)
);

-- 11.4 board_role_permissions
CREATE TABLE public.board_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_role_id uuid NOT NULL REFERENCES public.board_roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  allowed boolean NOT NULL,
  CONSTRAINT board_role_permissions_permission_check CHECK (
    permission IN (
      'board.view',
      'board.rename',
      'board.change_background',
      'board.invite_members',
      'board.remove_members',
      'roles.manage',
      'columns.create',
      'columns.rename',
      'columns.reorder',
      'columns.delete',
      'cards.create',
      'cards.edit_own',
      'cards.edit_any',
      'cards.move',
      'cards.delete_own',
      'cards.delete_any',
      'card_fields.manage',
      'labels.manage',
      'card_preview.manage',
      'comments.create',
      'comments.edit_own',
      'comments.delete_own',
      'comments.moderate'
    )
  ),
  UNIQUE (board_role_id, permission)
);

-- 11.5 board_members
CREATE TABLE public.board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  board_role_id uuid NOT NULL REFERENCES public.board_roles(id) ON DELETE RESTRICT,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, user_id)
);

-- 11.6 board_invites
CREATE TABLE public.board_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'cancelled')),
  accepted_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_invites_status_acceptance_check CHECK (
    (status = 'accepted' AND accepted_user_id IS NOT NULL) OR
    (status IN ('pending', 'cancelled') AND accepted_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX board_invites_one_pending_per_email
  ON public.board_invites (board_id, email)
  WHERE status = 'pending';

-- 11.7 board_columns
CREATE TABLE public.board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  column_type text NOT NULL CHECK (column_type IN ('queue', 'in_work', 'done', 'info')),
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_columns_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 50)
);

-- 11.8 cards
CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.board_columns(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  position double precision NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  responsible_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  moved_to_column_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cards_title_length CHECK (char_length(title) >= 1 AND char_length(title) <= 200)
);

-- 11.9 card_assignees
CREATE TABLE public.card_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, user_id)
);

-- 11.10 labels
CREATE TABLE public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, name),
  CONSTRAINT labels_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 30),
  CONSTRAINT labels_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- 11.11 card_labels
CREATE TABLE public.card_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, label_id)
);

-- 11.12 card_comments
CREATE TABLE public.card_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  reply_to_comment_id uuid REFERENCES public.card_comments(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT card_comments_body_length CHECK (char_length(body) >= 1 AND char_length(body) <= 5000)
);

-- 11.13 board_field_definitions
CREATE TABLE public.board_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('link', 'text', 'date', 'select')),
  is_required boolean NOT NULL DEFAULT false,
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_field_definitions_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 50)
);

-- 11.14 board_field_select_options
CREATE TABLE public.board_field_select_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id uuid NOT NULL REFERENCES public.board_field_definitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_field_select_options_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 50),
  CONSTRAINT board_field_select_options_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- 11.15 card_field_values
CREATE TABLE public.card_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.board_field_definitions(id) ON DELETE CASCADE,
  text_value text,
  date_value date,
  link_url text,
  link_text text,
  select_option_id uuid REFERENCES public.board_field_select_options(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, field_definition_id)
);

-- 11.16 card_activity
CREATE TABLE public.card_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  activity_type text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11.17 telegram_link_tokens
CREATE TABLE public.telegram_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11.18 notification_outbox
CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel = 'telegram'),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  event_type text NOT NULL CHECK (
    event_type IN ('added_to_card', 'made_responsible', 'card_comment_new', 'card_moved')
  ),
  actor_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_attempts_range CHECK (attempts >= 0 AND attempts <= 5)
);

-- 11.19 notification_preferences
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram', 'internal')),
  event_type text NOT NULL CHECK (
    event_type IN ('added_to_card', 'made_responsible', 'card_comment_new', 'card_moved')
  ),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, event_type)
);

-- 11.20 notification_user_settings
CREATE TABLE public.notification_user_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start_local time,
  quiet_hours_end_local time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_user_settings_timezone_not_blank CHECK (btrim(timezone) <> ''),
  CONSTRAINT notification_user_settings_quiet_hours_check CHECK (
    (quiet_hours_enabled = false AND quiet_hours_start_local IS NULL AND quiet_hours_end_local IS NULL) OR
    (quiet_hours_enabled = true AND quiet_hours_start_local IS NOT NULL AND quiet_hours_end_local IS NOT NULL)
  )
);

-- 11.21 internal_notifications
CREATE TABLE public.internal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('added_to_card', 'made_responsible', 'card_comment_new', 'card_moved')
  ),
  actor_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

-- 11.22 board_card_preview_items
CREATE TABLE public.board_card_preview_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('title', 'assignees', 'comments_count', 'labels', 'responsible', 'custom_field')),
  field_definition_id uuid REFERENCES public.board_field_definitions(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  position double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_card_preview_items_custom_field CHECK (
    (item_type = 'custom_field' AND field_definition_id IS NOT NULL) OR
    (item_type != 'custom_field' AND field_definition_id IS NULL)
  ),
  CONSTRAINT board_card_preview_items_title_enabled CHECK (
    item_type != 'title' OR enabled = true
  )
);

CREATE UNIQUE INDEX board_card_preview_items_uniq_non_custom
  ON public.board_card_preview_items (board_id, item_type) WHERE field_definition_id IS NULL;
CREATE UNIQUE INDEX board_card_preview_items_uniq_custom
  ON public.board_card_preview_items (board_id, item_type, field_definition_id) WHERE field_definition_id IS NOT NULL;

-- 11.12: reply_to must be on same card — enforced by trigger
CREATE OR REPLACE FUNCTION public.check_comment_reply_same_card()
RETURNS trigger AS $$
BEGIN
  IF NEW.reply_to_comment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.card_comments c
      WHERE c.id = NEW.reply_to_comment_id AND c.card_id = NEW.card_id
    ) THEN
      RAISE EXCEPTION 'reply_to_comment_id must reference a comment on the same card';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER card_comments_reply_same_card
  BEFORE INSERT OR UPDATE ON public.card_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_comment_reply_same_card();
