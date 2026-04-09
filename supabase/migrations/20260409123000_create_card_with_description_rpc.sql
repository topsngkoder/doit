-- Создание карточки с описанием в модалке создания.
-- Добавляем перегрузку RPC create_card_with_details с аргументом p_description.

CREATE OR REPLACE FUNCTION public.create_card_with_details(
  p_board_id uuid,
  p_column_id uuid,
  p_title text,
  p_description text,
  p_assignee_user_ids uuid[],
  p_field_values jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_id uuid;
BEGIN
  p_description := coalesce(p_description, '');

  IF char_length(p_description) > 50000 THEN
    RAISE EXCEPTION 'Описание не длиннее 50000 символов.';
  END IF;

  v_card_id := public.create_card_with_details(
    p_board_id,
    p_column_id,
    p_title,
    p_assignee_user_ids,
    p_field_values
  );

  UPDATE public.cards
  SET description = p_description
  WHERE id = v_card_id;

  RETURN v_card_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_card_with_details(uuid, uuid, text, text, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_card_with_details(uuid, uuid, text, text, uuid[], jsonb) TO authenticated;
