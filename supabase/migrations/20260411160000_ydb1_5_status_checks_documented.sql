-- YDB1.5: enum-like допустимые значения статусов (спецификация, разд. статусов интеграции и вложений).
-- CHECK-ограничения уже созданы в 20260410180000 и 20260410181000; здесь только каталожная документация
-- и явная отметка в истории миграций, что посторонние статусы на уровне БД отвергаются.

COMMENT ON CONSTRAINT board_yandex_disk_integrations_status_check
  ON public.board_yandex_disk_integrations IS
  'Допустимые статусы интеграции: active, reauthorization_required, disconnected, error.';

COMMENT ON CONSTRAINT card_attachments_status_check ON public.card_attachments IS
  'Допустимые статусы вложения: uploading, ready, failed.';
