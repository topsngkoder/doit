-- YDB1.2: вложения карточек (спецификация 7.2)
-- Согласованность board_id с cards.board_id обеспечивает приложение; RLS — YDB1.4

CREATE TABLE public.card_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  storage_provider text NOT NULL,
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  CONSTRAINT card_attachments_storage_provider_check CHECK (storage_provider = 'yandex_disk'),
  CONSTRAINT card_attachments_status_check CHECK (status IN ('uploading', 'ready', 'failed')),
  CONSTRAINT card_attachments_size_bytes_non_negative CHECK (size_bytes >= 0)
);

COMMENT ON TABLE public.card_attachments IS
  'Вложения карточек во внешнем хранилище; в UI списка — только status = ready (спец. 7.2).';

CREATE INDEX card_attachments_card_id_idx ON public.card_attachments (card_id);

CREATE INDEX card_attachments_board_id_idx ON public.card_attachments (board_id);

CREATE INDEX card_attachments_status_idx ON public.card_attachments (status);

ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;
