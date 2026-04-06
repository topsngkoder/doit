-- E2: auto-accept pending board invites when the user's profile email matches (scenario 9.2).

CREATE OR REPLACE FUNCTION public.accept_pending_board_invites_for_current_user()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_accepted int := 0;
  r record;
  v_basic_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT lower(trim(p.email)) INTO v_email
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT bi.id AS invite_id, bi.board_id
    FROM public.board_invites bi
    WHERE bi.status = 'pending'
      AND lower(trim(bi.email)) = v_email
    ORDER BY bi.created_at
    FOR UPDATE OF bi
  LOOP
    SELECT br.id INTO v_basic_role_id
    FROM public.board_roles br
    WHERE br.board_id = r.board_id
      AND br.key = 'basic'
    LIMIT 1;

    IF v_basic_role_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.board_members (board_id, user_id, board_role_id, is_owner)
    VALUES (r.board_id, v_uid, v_basic_role_id, false)
    ON CONFLICT (board_id, user_id) DO NOTHING;

    UPDATE public.board_invites
    SET
      status = 'accepted',
      accepted_user_id = v_uid,
      updated_at = now()
    WHERE id = r.invite_id;

    v_accepted := v_accepted + 1;
  END LOOP;

  RETURN v_accepted;
END;
$$;

COMMENT ON FUNCTION public.accept_pending_board_invites_for_current_user() IS
  'Accepts all pending board_invites whose email matches the current user profile; adds basic role membership (9.2).';

GRANT EXECUTE ON FUNCTION public.accept_pending_board_invites_for_current_user() TO authenticated;
