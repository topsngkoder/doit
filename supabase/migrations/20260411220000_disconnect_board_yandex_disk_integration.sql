-- YDB3.6: отключение интеграции Яндекс.Диска для доски (спец. 9.x disconnect).
-- Статус `disconnected`, токены очищаются; файлы на Диске и строки вложений не трогаем.
-- SECURITY DEFINER: клиент не имеет SELECT на `board_yandex_disk_integrations` (YDB1.4).

CREATE OR REPLACE FUNCTION public.disconnect_board_yandex_disk_integration(p_board_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_manage_board_yandex_disk_integration(p_board_id) THEN
    RETURN 'forbidden';
  END IF;

  UPDATE public.board_yandex_disk_integrations
  SET
    status = 'disconnected',
    encrypted_access_token = NULL,
    encrypted_refresh_token = NULL,
    access_token_expires_at = NULL,
    last_error_text = NULL
  WHERE board_id = p_board_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.disconnect_board_yandex_disk_integration(uuid) IS
  'YDB3.6: отключить интеграцию доски — только владелец/sysadmin; без удаления файлов Диска и вложений в БД.';

GRANT EXECUTE ON FUNCTION public.disconnect_board_yandex_disk_integration(uuid) TO authenticated;
