-- Doit: I2 — comments edit/delete via UPDATE with soft-delete

-- Жесткое удаление комментариев пользователями отключаем:
DROP POLICY IF EXISTS card_comments_delete_authz ON public.card_comments;

-- UPDATE-права расширяем: для soft-delete нужны comments.delete_own/comments.moderate.
DROP POLICY IF EXISTS card_comments_update_authz ON public.card_comments;
CREATE POLICY card_comments_update_authz
  ON public.card_comments
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_comments.card_id
        AND (
          public.has_board_permission(c.board_id, 'comments.moderate')
          OR (
            public.has_board_permission(c.board_id, 'comments.edit_own')
            AND card_comments.author_user_id = auth.uid()
          )
          OR (
            public.has_board_permission(c.board_id, 'comments.delete_own')
            AND card_comments.author_user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.cards c
      WHERE c.id = card_comments.card_id
        AND (
          public.has_board_permission(c.board_id, 'comments.moderate')
          OR (
            public.has_board_permission(c.board_id, 'comments.edit_own')
            AND card_comments.author_user_id = auth.uid()
          )
          OR (
            public.has_board_permission(c.board_id, 'comments.delete_own')
            AND card_comments.author_user_id = auth.uid()
          )
        )
    )
  );

-- Ограничиваем update-поведение:
-- - после soft-delete нельзя менять body;
-- - comment нельзя "восстановить" (deleted_at обратно в NULL).
CREATE OR REPLACE FUNCTION public.enforce_card_comments_soft_delete_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.is_system_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      RAISE EXCEPTION 'cannot edit deleted comment';
    END IF;
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'cannot restore deleted comment';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'cannot change deleted_at for deleted comment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_comments_enforce_soft_delete_scope ON public.card_comments;
CREATE TRIGGER card_comments_enforce_soft_delete_scope
  BEFORE UPDATE ON public.card_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_card_comments_soft_delete_scope();
