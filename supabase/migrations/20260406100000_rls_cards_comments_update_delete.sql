-- Doit: C4 — RLS update/delete for cards and card_comments (own vs any + move/delete split)

-- ---------------------------------------------------------------- cards: enforce update scope (cards.move без edit_* не трогает контент)
CREATE OR REPLACE FUNCTION public.enforce_cards_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF public.is_system_admin(uid) THEN
    RETURN NEW;
  END IF;

  IF public.has_board_permission(uid, NEW.board_id, 'cards.edit_any') THEN
    RETURN NEW;
  END IF;

  IF
    public.has_board_permission(uid, NEW.board_id, 'cards.edit_own')
    AND OLD.created_by_user_id = uid
  THEN
    RETURN NEW;
  END IF;

  IF public.has_board_permission(uid, NEW.board_id, 'cards.move') THEN
    IF NEW.board_id IS DISTINCT FROM OLD.board_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    THEN
      RAISE EXCEPTION 'cards.move allows only column, position, responsible and move timestamps';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not permitted to update card';
END;
$$;

DROP TRIGGER IF EXISTS cards_enforce_update_scope ON public.cards;
CREATE TRIGGER cards_enforce_update_scope
  BEFORE UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cards_update_scope();

-- ---------------------------------------------------------------- card_comments: card_id и автор не меняются с клиента
CREATE OR REPLACE FUNCTION public.enforce_card_comments_immutable_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.card_id IS DISTINCT FROM OLD.card_id
    OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
  THEN
    IF NOT public.is_system_admin() THEN
      RAISE EXCEPTION 'card_id and author_user_id cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_comments_enforce_immutable_refs ON public.card_comments;
CREATE TRIGGER card_comments_enforce_immutable_refs
  BEFORE UPDATE ON public.card_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_card_comments_immutable_refs();

-- ---------------------------------------------------------------- cards: UPDATE / DELETE policies
DROP POLICY IF EXISTS cards_update_authz ON public.cards;
CREATE POLICY cards_update_authz
  ON public.cards
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin()
    OR public.has_board_permission(board_id, 'cards.edit_any')
    OR (
      public.has_board_permission(board_id, 'cards.edit_own')
      AND created_by_user_id = auth.uid()
    )
    OR public.has_board_permission(board_id, 'cards.move')
  )
  WITH CHECK (
    (
      public.is_system_admin()
      OR public.has_board_permission(board_id, 'cards.edit_any')
      OR (
        public.has_board_permission(board_id, 'cards.edit_own')
        AND created_by_user_id = auth.uid()
      )
      OR public.has_board_permission(board_id, 'cards.move')
    )
    AND EXISTS (
      SELECT 1
      FROM public.board_columns bc
      WHERE bc.id = cards.column_id
        AND bc.board_id = cards.board_id
    )
  );

DROP POLICY IF EXISTS cards_delete_authz ON public.cards;
CREATE POLICY cards_delete_authz
  ON public.cards
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin()
    OR public.has_board_permission(board_id, 'cards.delete_any')
    OR (
      public.has_board_permission(board_id, 'cards.delete_own')
      AND created_by_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------- card_comments: UPDATE / DELETE policies
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
        )
    )
  );

DROP POLICY IF EXISTS card_comments_delete_authz ON public.card_comments;
CREATE POLICY card_comments_delete_authz
  ON public.card_comments
  FOR DELETE
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
            public.has_board_permission(c.board_id, 'comments.delete_own')
            AND card_comments.author_user_id = auth.uid()
          )
        )
    )
  );
