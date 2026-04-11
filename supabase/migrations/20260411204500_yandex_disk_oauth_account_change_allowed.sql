-- YDB3.5: запрет смены Яндекс-аккаунта интеграции доски при наличии готовых вложений.
-- Чтение `board_yandex_disk_integrations` с пользовательского клиента недоступно (REVOKE SELECT);
-- проверка в SECURITY DEFINER после успешного OAuth-профиля.

CREATE OR REPLACE FUNCTION public.yandex_disk_oauth_account_change_allowed(
  p_board_id uuid,
  p_new_yandex_account_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN NOT public.can_manage_board_yandex_disk_integration(p_board_id) THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.board_yandex_disk_integrations i
      WHERE i.board_id = p_board_id
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM public.board_yandex_disk_integrations i
      WHERE i.board_id = p_board_id
        AND i.yandex_account_id = p_new_yandex_account_id
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM public.card_attachments ca
      WHERE ca.board_id = p_board_id
        AND ca.status = 'ready'
    ) THEN false
    ELSE true
  END;
$$;

COMMENT ON FUNCTION public.yandex_disk_oauth_account_change_allowed(uuid, text) IS
  'OAuth Яндекс.Диска (спец. YDB3.5): смена `yandex_account_id` запрещена, если на доске есть вложения со статусом ready.';

GRANT EXECUTE ON FUNCTION public.yandex_disk_oauth_account_change_allowed(uuid, text) TO authenticated;
