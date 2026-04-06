-- Doit: RLS for custom fields (definitions/options/values)

ALTER TABLE public.board_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_field_select_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_field_values ENABLE ROW LEVEL SECURITY;

-- =========================
-- board_field_definitions
-- =========================

DROP POLICY IF EXISTS board_field_definitions_select_board_view ON public.board_field_definitions;
CREATE POLICY board_field_definitions_select_board_view
  ON public.board_field_definitions
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'board.view')
  );

DROP POLICY IF EXISTS board_field_definitions_insert_card_fields_manage ON public.board_field_definitions;
CREATE POLICY board_field_definitions_insert_card_fields_manage
  ON public.board_field_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(board_id, 'card_fields.manage')
  );

DROP POLICY IF EXISTS board_field_definitions_update_card_fields_manage ON public.board_field_definitions;
CREATE POLICY board_field_definitions_update_card_fields_manage
  ON public.board_field_definitions
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'card_fields.manage')
  )
  WITH CHECK (
    public.has_board_permission(board_id, 'card_fields.manage')
  );

DROP POLICY IF EXISTS board_field_definitions_delete_card_fields_manage ON public.board_field_definitions;
CREATE POLICY board_field_definitions_delete_card_fields_manage
  ON public.board_field_definitions
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(board_id, 'card_fields.manage')
  );

-- =========================
-- board_field_select_options
-- =========================

DROP POLICY IF EXISTS board_field_select_options_select_board_view ON public.board_field_select_options;
CREATE POLICY board_field_select_options_select_board_view
  ON public.board_field_select_options
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(
      (
        SELECT d.board_id
        FROM public.board_field_definitions d
        WHERE d.id = field_definition_id
      ),
      'board.view'
    )
  );

DROP POLICY IF EXISTS board_field_select_options_insert_card_fields_manage ON public.board_field_select_options;
CREATE POLICY board_field_select_options_insert_card_fields_manage
  ON public.board_field_select_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_board_permission(
      (
        SELECT d.board_id
        FROM public.board_field_definitions d
        WHERE d.id = field_definition_id
      ),
      'card_fields.manage'
    )
  );

DROP POLICY IF EXISTS board_field_select_options_update_card_fields_manage ON public.board_field_select_options;
CREATE POLICY board_field_select_options_update_card_fields_manage
  ON public.board_field_select_options
  FOR UPDATE
  TO authenticated
  USING (
    public.has_board_permission(
      (
        SELECT d.board_id
        FROM public.board_field_definitions d
        WHERE d.id = field_definition_id
      ),
      'card_fields.manage'
    )
  )
  WITH CHECK (
    public.has_board_permission(
      (
        SELECT d.board_id
        FROM public.board_field_definitions d
        WHERE d.id = field_definition_id
      ),
      'card_fields.manage'
    )
  );

DROP POLICY IF EXISTS board_field_select_options_delete_card_fields_manage ON public.board_field_select_options;
CREATE POLICY board_field_select_options_delete_card_fields_manage
  ON public.board_field_select_options
  FOR DELETE
  TO authenticated
  USING (
    public.has_board_permission(
      (
        SELECT d.board_id
        FROM public.board_field_definitions d
        WHERE d.id = field_definition_id
      ),
      'card_fields.manage'
    )
  );

-- =========================
-- card_field_values
-- =========================

DROP POLICY IF EXISTS card_field_values_select_board_view ON public.card_field_values;
CREATE POLICY card_field_values_select_board_view
  ON public.card_field_values
  FOR SELECT
  TO authenticated
  USING (
    public.has_board_permission(
      (
        SELECT c.board_id
        FROM public.cards c
        WHERE c.id = card_id
      ),
      'board.view'
    )
  );

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
    )
  );

