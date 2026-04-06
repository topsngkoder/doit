-- Участник карточки (card_assignees) может менять название, описание, кастомные поля и метки,
-- без права cards.edit_own на чужие карточки. Состав участников по-прежнему через mutate_card_assignee (редактор).

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

  IF
    EXISTS (
      SELECT 1
      FROM public.card_assignees ca
      WHERE ca.card_id = OLD.id
        AND ca.user_id = uid
    )
    AND public.has_board_permission(uid, OLD.board_id, 'board.view')
    AND NOT (
      NEW.board_id IS DISTINCT FROM OLD.board_id
      OR NEW.column_id IS DISTINCT FROM OLD.column_id
      OR NEW.position IS DISTINCT FROM OLD.position
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.responsible_user_id IS DISTINCT FROM OLD.responsible_user_id
      OR NEW.moved_to_column_at IS DISTINCT FROM OLD.moved_to_column_at
    )
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
    OR EXISTS (
      SELECT 1
      FROM public.card_assignees ca
      WHERE ca.card_id = cards.id
        AND ca.user_id = auth.uid()
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
      OR EXISTS (
        SELECT 1
        FROM public.card_assignees ca
        WHERE ca.card_id = cards.id
          AND ca.user_id = auth.uid()
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

-- card_field_values: assignee + board.view
DROP POLICY IF EXISTS card_field_values_insert_cards_edit ON public.card_field_values;
CREATE POLICY card_field_values_insert_cards_edit
  ON public.card_field_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.has_board_permission(
        (
          SELECT c.board_id
          FROM public.cards c
          WHERE c.id = card_id
        ),
        'cards.edit_any'
      )
      OR (
        public.has_board_permission(
          (
            SELECT c.board_id
            FROM public.cards c
            WHERE c.id = card_id
          ),
          'cards.edit_own'
        )
        AND EXISTS (
          SELECT 1
          FROM public.cards c
          WHERE c.id = card_id
            AND c.created_by_user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.cards c
        JOIN public.card_assignees ca
          ON ca.card_id = c.id AND ca.user_id = auth.uid()
        WHERE c.id = card_id
          AND public.has_board_permission(c.board_id, 'board.view')
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_field_definitions d
        ON d.board_id = c.board_id
      WHERE c.id = card_id
        AND d.id = field_definition_id
    )
    AND (
      select_option_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.board_field_select_options o
        WHERE o.id = select_option_id
          AND o.field_definition_id = field_definition_id
      )
    )
  );

DROP POLICY IF EXISTS card_field_values_update_cards_edit ON public.card_field_values;
CREATE POLICY card_field_values_update_cards_edit
  ON public.card_field_values
  FOR UPDATE
  TO authenticated
  USING (
    (
      public.has_board_permission(
        (
          SELECT c.board_id
          FROM public.cards c
          WHERE c.id = card_id
        ),
        'cards.edit_any'
      )
      OR (
        public.has_board_permission(
          (
            SELECT c.board_id
            FROM public.cards c
            WHERE c.id = card_id
          ),
          'cards.edit_own'
        )
        AND EXISTS (
          SELECT 1
          FROM public.cards c
          WHERE c.id = card_id
            AND c.created_by_user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.cards c
        JOIN public.card_assignees ca
          ON ca.card_id = c.id AND ca.user_id = auth.uid()
        WHERE c.id = card_id
          AND public.has_board_permission(c.board_id, 'board.view')
      )
    )
  )
  WITH CHECK (
    (
      public.has_board_permission(
        (
          SELECT c.board_id
          FROM public.cards c
          WHERE c.id = card_id
        ),
        'cards.edit_any'
      )
      OR (
        public.has_board_permission(
          (
            SELECT c.board_id
            FROM public.cards c
            WHERE c.id = card_id
          ),
          'cards.edit_own'
        )
        AND EXISTS (
          SELECT 1
          FROM public.cards c
          WHERE c.id = card_id
            AND c.created_by_user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.cards c
        JOIN public.card_assignees ca
          ON ca.card_id = c.id AND ca.user_id = auth.uid()
        WHERE c.id = card_id
          AND public.has_board_permission(c.board_id, 'board.view')
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_field_definitions d
        ON d.board_id = c.board_id
      WHERE c.id = card_id
        AND d.id = field_definition_id
    )
    AND (
      select_option_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.board_field_select_options o
        WHERE o.id = select_option_id
          AND o.field_definition_id = field_definition_id
      )
    )
  );

DROP POLICY IF EXISTS card_field_values_delete_cards_edit ON public.card_field_values;
CREATE POLICY card_field_values_delete_cards_edit
  ON public.card_field_values
  FOR DELETE
  TO authenticated
  USING (
    (
      public.has_board_permission(
        (
          SELECT c.board_id
          FROM public.cards c
          WHERE c.id = card_id
        ),
        'cards.edit_any'
      )
      OR (
        public.has_board_permission(
          (
            SELECT c.board_id
            FROM public.cards c
            WHERE c.id = card_id
          ),
          'cards.edit_own'
        )
        AND EXISTS (
          SELECT 1
          FROM public.cards c
          WHERE c.id = card_id
            AND c.created_by_user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.cards c
        JOIN public.card_assignees ca
          ON ca.card_id = c.id AND ca.user_id = auth.uid()
        WHERE c.id = card_id
          AND public.has_board_permission(c.board_id, 'board.view')
      )
    )
  );

-- card_labels
DROP POLICY IF EXISTS card_labels_insert_edit_any_or_own ON public.card_labels;
CREATE POLICY card_labels_insert_edit_any_or_own
  ON public.card_labels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.labels l
        ON l.id = card_labels.label_id
      WHERE c.id = card_labels.card_id
        AND l.board_id = c.board_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.card_assignees ca
            WHERE ca.card_id = c.id
              AND ca.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS card_labels_delete_edit_any_or_own ON public.card_labels;
CREATE POLICY card_labels_delete_edit_any_or_own
  ON public.card_labels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.labels l
        ON l.id = card_labels.label_id
      WHERE c.id = card_labels.card_id
        AND l.board_id = c.board_id
        AND (
          public.has_board_permission(c.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(c.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.card_assignees ca
            WHERE ca.card_id = c.id
              AND ca.user_id = auth.uid()
          )
        )
    )
  );

-- card_activity: события переименования / описания от assignee
DROP POLICY IF EXISTS card_activity_insert_actor_with_permission ON public.card_activity;
CREATE POLICY card_activity_insert_actor_with_permission
  ON public.card_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.cards c
      JOIN public.board_columns bc ON bc.id = c.column_id
      WHERE c.id = card_activity.card_id
        AND (
          public.has_board_permission(bc.board_id, 'cards.create')
          OR public.has_board_permission(bc.board_id, 'cards.edit_any')
          OR (
            public.has_board_permission(bc.board_id, 'cards.edit_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.card_assignees ca
            WHERE ca.card_id = c.id
              AND ca.user_id = auth.uid()
          )
          OR public.has_board_permission(bc.board_id, 'cards.move')
          OR public.has_board_permission(bc.board_id, 'cards.delete_any')
          OR (
            public.has_board_permission(bc.board_id, 'cards.delete_own')
            AND c.created_by_user_id = auth.uid()
          )
          OR public.has_board_permission(bc.board_id, 'comments.create')
          OR public.has_board_permission(bc.board_id, 'comments.edit_own')
          OR public.has_board_permission(bc.board_id, 'comments.moderate')
          OR public.has_board_permission(bc.board_id, 'labels.manage')
          OR public.has_board_permission(bc.board_id, 'card_fields.manage')
        )
    )
  );
