-- YDB1.1: привязка Яндекс.Диска к доске (спецификация 7.1)
-- RLS-политики: отдельная задача YDB1.4

CREATE TABLE public.board_yandex_disk_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  yandex_account_id text NOT NULL,
  yandex_login text NOT NULL,
  root_folder_path text NOT NULL,
  encrypted_access_token text,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  status text NOT NULL,
  connected_by_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_authorized_at timestamptz,
  last_error_text text,
  CONSTRAINT board_yandex_disk_integrations_status_check CHECK (
    status IN ('active', 'reauthorization_required', 'disconnected', 'error')
  )
);

COMMENT ON TABLE public.board_yandex_disk_integrations IS
  'Одна логическая интеграция Яндекс.Диска на доску; статусы см. спецификацию 7.1.';

-- Ровно одна запись на доску; при этом не более одной active (единственная строка).
CREATE UNIQUE INDEX board_yandex_disk_integrations_board_id_key
  ON public.board_yandex_disk_integrations (board_id);

CREATE INDEX board_yandex_disk_integrations_status_idx
  ON public.board_yandex_disk_integrations (status);

ALTER TABLE public.board_yandex_disk_integrations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_board_yandex_disk_integrations_updated_at
  ON public.board_yandex_disk_integrations;
CREATE TRIGGER set_board_yandex_disk_integrations_updated_at
  BEFORE UPDATE ON public.board_yandex_disk_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
