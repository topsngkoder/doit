-- NT5.4: card_comment_new только для новой строки без soft-delete (spec DoD).
-- UPDATE/soft-delete по-прежнему без enqueue; здесь блокируем INSERT с deleted_at IS NOT NULL.

CREATE OR REPLACE FUNCTION public.enforce_card_comments_insert_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Комментарий нельзя создать уже помеченным удалённым.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_comments_insert_not_deleted ON public.card_comments;
CREATE TRIGGER card_comments_insert_not_deleted
  BEFORE INSERT ON public.card_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_card_comments_insert_not_deleted();

CREATE OR REPLACE FUNCTION public.create_card_comment(
  p_card_id uuid,
  p_body text,
  p_reply_to_comment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_board_id uuid;
  v_board_name text;
  v_card_title text;
  v_body text := trim(p_body);
  v_actor_display text;
  v_notify_body text;
  v_notify_link text;
  v_new_id uuid;
  r_assignee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация.';
  END IF;

  IF v_body IS NULL OR char_length(v_body) < 1 OR char_length(v_body) > 5000 THEN
    RAISE EXCEPTION 'Текст комментария: от 1 до 5000 символов.';
  END IF;

  SELECT c.board_id, b.name, c.title
  INTO v_board_id, v_board_name, v_card_title
  FROM public.cards c
  JOIN public.boards b ON b.id = c.board_id
  WHERE c.id = p_card_id;

  IF v_board_id IS NULL THEN
    RAISE EXCEPTION 'Карточка не найдена.';
  END IF;

  IF NOT public.has_board_permission(v_board_id, 'comments.create') THEN
    RAISE EXCEPTION 'Нет права оставлять комментарии.';
  END IF;

  INSERT INTO public.card_comments (
    card_id,
    author_user_id,
    body,
    reply_to_comment_id,
    deleted_at
  )
  VALUES (
    p_card_id,
    v_uid,
    v_body,
    p_reply_to_comment_id,
    NULL
  )
  RETURNING id INTO v_new_id;

  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(p.email, '@', 1),
    'Пользователь'
  )
  INTO v_actor_display
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF v_actor_display IS NULL THEN
    v_actor_display := 'Пользователь';
  END IF;

  v_notify_link := format('/boards/%s?card=%s', v_board_id::text, p_card_id::text);

  v_notify_body := format(
    E'Новый комментарий в карточке «%s» на доске «%s».\n\n%s\n\nАвтор: %s.',
    v_card_title,
    v_board_name,
    v_body,
    v_actor_display
  );

  -- Строка только что вставлена с deleted_at = NULL; цикл — явный контракт для уведомлений.
  IF EXISTS (
    SELECT 1
    FROM public.card_comments cc
    WHERE cc.id = v_new_id
      AND cc.deleted_at IS NULL
  ) THEN
    FOR r_assignee IN
      SELECT ca.user_id
      FROM public.card_assignees ca
      WHERE ca.card_id = p_card_id
    LOOP
      PERFORM public.enqueue_notification_event(
        r_assignee,
        'card_comment_new',
        v_uid,
        v_board_id,
        p_card_id,
        v_notify_body,
        v_notify_link
      );
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_card_comment(uuid, text, uuid) IS
'Вставка card_comments (deleted_at всегда NULL при создании); уведомления только для неудалённой новой строки; правило автора — в enqueue_notification_event.';
