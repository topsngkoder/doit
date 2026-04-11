-- YDB1.4: RLS-политики для интеграции Яндекс.Диска и вложений карточек (спец. 7–8, 9.x про owner-only)

-- Право «редактировать содержимое карточки» = та же логика, что card_field_values (assignee + edit_any/edit_own).
CREATE OR REPLACE FUNCTION public.can_edit_card_content(p_card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = p_card_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR (
            EXISTS (
              SELECT 1
              FROM public.card_assignees ca
              WHERE ca.card_id = c.id
                AND ca.user_id = auth.uid()
            )
            AND public.has_board_permission(c.board_id, 'board.view')
          )
        )
    );
$$;

COMMENT ON FUNCTION public.can_edit_card_content(uuid) IS
  'RLS: мутации вложений/содержимого карточки; не смешивать с boards.owner (интеграция Диска — отдельно).';

GRANT EXECUTE ON FUNCTION public.can_edit_card_content(uuid) TO authenticated;

-- Интеграция: клиент не читает строку (в т.ч. токены); мутации — только владелец доски (спец. owner-only).
REVOKE SELECT ON TABLE public.board_yandex_disk_integrations FROM authenticated;
REVOKE SELECT ON TABLE public.board_yandex_disk_integrations FROM anon;

DROP POLICY IF EXISTS board_yandex_disk_integrations_insert_owner
  ON public.board_yandex_disk_integrations;
CREATE POLICY board_yandex_disk_integrations_insert_owner
  ON public.board_yandex_disk_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = board_id
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS board_yandex_disk_integrations_update_owner
  ON public.board_yandex_disk_integrations;
CREATE POLICY board_yandex_disk_integrations_update_owner
  ON public.board_yandex_disk_integrations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = board_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = board_id
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS board_yandex_disk_integrations_delete_owner
  ON public.board_yandex_disk_integrations;
CREATE POLICY board_yandex_disk_integrations_delete_owner
  ON public.board_yandex_disk_integrations
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.boards b
      WHERE b.id = board_id
        AND b.owner_user_id = auth.uid()
    )
  );

-- Вложения: в списке для клиента — только ready + просмотр доски; мутации — как содержимое карточки.
-- DELETE допускает и CASCADE при удалении карточки (delete_any/delete_own), иначе каскад ломается.
DROP POLICY IF EXISTS card_attachments_select_ready_board_view ON public.card_attachments;
CREATE POLICY card_attachments_select_ready_board_view
  ON public.card_attachments
  FOR SELECT
  TO authenticated
  USING (
    status = 'ready'
    AND public.has_board_permission(board_id, 'board.view')
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
    )
  );

DROP POLICY IF EXISTS card_attachments_insert_content_edit ON public.card_attachments;
CREATE POLICY card_attachments_insert_content_edit
  ON public.card_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_card_content(card_id)
    AND uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
    )
  );

DROP POLICY IF EXISTS card_attachments_update_content_edit ON public.card_attachments;
CREATE POLICY card_attachments_update_content_edit
  ON public.card_attachments
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_card_content(card_id))
  WITH CHECK (
    public.can_edit_card_content(card_id)
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
    )
  );

DROP POLICY IF EXISTS card_attachments_delete_authz ON public.card_attachments;
CREATE POLICY card_attachments_delete_authz
  ON public.card_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR public.can_edit_card_content(card_id)
    OR EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_id
        AND c.board_id = board_id
        AND (
          public.has_board_permission(c.board_id, 'cards.delete_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.delete_own')
            AND c.created_by_user_id = auth.uid()
          )
        )
    )
  );
