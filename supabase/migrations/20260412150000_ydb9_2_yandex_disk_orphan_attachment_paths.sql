-- YDB9.2: учёт обнаруженных на Яндекс.Диске файлов без строки `card_attachments` (спец. SLA ≤24 ч после обнаружения).
-- Удаление с Диска выполняет приложение (service_role); пользовательский клиент к таблице не ходит.

CREATE TABLE public.yandex_disk_orphan_attachment_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards (id) ON DELETE CASCADE,
  disk_path text NOT NULL,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT yandex_disk_orphan_attachment_paths_board_path_key UNIQUE (board_id, disk_path)
);

CREATE INDEX yandex_disk_orphan_attachment_paths_board_first_idx
  ON public.yandex_disk_orphan_attachment_paths (board_id, first_detected_at);

COMMENT ON TABLE public.yandex_disk_orphan_attachment_paths IS
  'YDB9.2: пути на Яндекс.Диске без соответствующей строки card_attachments; удаление файла после first_detected_at + SLA.';

ALTER TABLE public.yandex_disk_orphan_attachment_paths ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yandex_disk_orphan_attachment_paths FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yandex_disk_orphan_attachment_paths TO service_role;
