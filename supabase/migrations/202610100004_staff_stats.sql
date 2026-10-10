create function public.get_staff_stats(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return jsonb_build_object(
    'participants_count',(select count(*) from public.participants where event_id=p_event_id and not is_test),
    'checked_in_count',(select count(*) from public.participants where event_id=p_event_id and not is_test and checked_in),
    'confirmed_winners_count',(select count(distinct participant_id) from public.draws where event_id=p_event_id and status='confirmed')
  );
end $$;
revoke execute on function public.get_staff_stats(uuid) from public,anon;
grant execute on function public.get_staff_stats(uuid) to authenticated;
