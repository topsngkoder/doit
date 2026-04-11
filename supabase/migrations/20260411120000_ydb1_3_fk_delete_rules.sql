-- YDB1.3: зафиксировать FK и delete-правила (спец. 9.6, 12.4)
-- - Вложения каскадно удаляются при удалении карточки (ON DELETE CASCADE по card_id;
--   составной FK дублирует каскад и гарантирует board_id = cards.board_id).
-- - Удаление файлов в Яндекс.Диске при удалении карточки — зона ответственности приложения (12.4);
--   SQL не вызывает API провайдера.
-- - Отключение интеграции — смена status на disconnected (9.6), не DELETE строки;
--   ON DELETE CASCADE ниже относится только к удалению доски из БД и не затрагивает Диск.

ALTER TABLE public.cards
  ADD CONSTRAINT cards_id_board_id_key UNIQUE (id, board_id);

ALTER TABLE public.card_attachments
  ADD CONSTRAINT card_attachments_card_board_fkey
  FOREIGN KEY (card_id, board_id)
  REFERENCES public.cards (id, board_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT card_attachments_card_board_fkey ON public.card_attachments IS
  'Связка вложения с карточкой и доской; при удалении карточки строки вложений удаляются каскадом (спец. 12.4 — запись в БД).';

COMMENT ON TABLE public.board_yandex_disk_integrations IS
  'Одна логическая интеграция Яндекс.Диска на доску. Отключение (спец. 9.6): status = disconnected — файлы на Диске и записи вложений не удаляются. ON DELETE CASCADE к boards удаляет только строку интеграции в БД при удалении доски, не API Яндекса.';

COMMENT ON TABLE public.card_attachments IS
  'Вложения карточек во внешнем хранилище; в UI списка — только status = ready (спец. 7.2). При удалении карточки записи удаляются каскадом; удаление объектов у провайдера — в приложении (спец. 12.4).';
