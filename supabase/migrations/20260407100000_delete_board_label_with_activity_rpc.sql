create or replace function public.delete_board_label_with_activity(
  p_board_id uuid,
  p_label_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_label_name text;
  v_card_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;

  if not public.has_board_permission(v_actor, p_board_id, 'labels.manage') then
    raise exception 'not permitted to manage labels on this board';
  end if;

  select l.name
    into v_label_name
  from public.labels l
  where l.id = p_label_id
    and l.board_id = p_board_id;

  if v_label_name is null then
    raise exception 'label not found on this board';
  end if;

  for v_card_id in
    select distinct cl.card_id
    from public.card_labels cl
    join public.cards c on c.id = cl.card_id
    where cl.label_id = p_label_id
      and c.board_id = p_board_id
  loop
    insert into public.card_activity (
      card_id,
      actor_user_id,
      activity_type,
      message,
      payload
    )
    values (
      v_card_id,
      v_actor,
      'label_removed',
      format('Удалена метка "%s" из карточки', v_label_name),
      jsonb_build_object(
        'label_id', p_label_id,
        'label_name', v_label_name,
        'source', 'board_label_deleted'
      )
    );
  end loop;

  delete from public.labels l
  where l.id = p_label_id
    and l.board_id = p_board_id;
end;
$$;

grant execute on function public.delete_board_label_with_activity(uuid, uuid) to authenticated;
