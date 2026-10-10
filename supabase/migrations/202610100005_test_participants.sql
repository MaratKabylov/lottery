create function public.manage_test_participants(p_event_id uuid,p_count integer default 0,p_remove boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare last_ticket integer; affected integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'Мероприятие не найдено'; end if;
  if p_remove then
    delete from public.participants p where p.event_id=p_event_id and p.is_test
      and not exists(select 1 from public.draws d where d.participant_id=p.id);
    get diagnostics affected = row_count;
    update public.event_screen_state set updated_at=clock_timestamp() where event_id=p_event_id;
  else
    if p_count not in (10,50,100,500) then raise exception 'Выберите 10, 50, 100 или 500'; end if;
    update public.event_ticket_counters set last_number=last_number+p_count where event_id=p_event_id returning last_number into last_ticket;
    insert into public.participants(event_id,name,ticket_number,is_test)
      select p_event_id,'Тестовый гость '||n,n,true from generate_series(last_ticket-p_count+1,last_ticket) n;
    affected := p_count;
  end if;
  insert into public.audit_logs(event_id,user_id,action,entity_type,metadata)
    values(p_event_id,auth.uid(),case when p_remove then 'test_participants_removed' else 'test_participants_created' end,'participants',jsonb_build_object('count',affected));
  return affected;
end $$;
revoke execute on function public.manage_test_participants(uuid,integer,boolean) from public,anon;
grant execute on function public.manage_test_participants(uuid,integer,boolean) to authenticated;
