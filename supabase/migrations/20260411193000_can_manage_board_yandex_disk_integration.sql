-- Yandex Disk: проверка права управлять интеграцией доски без зависимости от SELECT boards под RLS (board.view).
-- Совпадает с правилом YDB3.1: владелец доски или системный администратор.

CREATE OR REPLACE FUNCTION public.can_manage_board_yandex_disk_integration(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.is_system_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.boards b
    WHERE b.id = p_board_id
      AND b.owner_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.can_manage_board_yandex_disk_integration(uuid) IS
  'Интеграция Яндекс.Диска (спец. 8.1): владелец доски или sysadmin. SECURITY DEFINER — проверка owner без политики boards_select.';

GRANT EXECUTE ON FUNCTION public.can_manage_board_yandex_disk_integration(uuid) TO authenticated;
