-- Use the same event lock as draw/confirm/cancel so screen commands cannot
-- hide a pending winner or race with starting a draw.
create function public.set_screen_mode(p_event_id uuid, p_mode text, p_seconds integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; s public.event_screen_state;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('waiting','paused','countdown') then raise exception 'Недопустимый режим экрана'; end if;
  if p_mode='countdown' and (p_seconds is null or p_seconds not between 1 and 600) then raise exception 'Укажите длительность от 1 до 600 секунд'; end if;
  if p_mode<>'countdown' and p_seconds is not null then raise exception 'Длительность допустима только для обратного отсчёта'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or e.status<>'active' then raise exception 'Мероприятие не активно'; end if;
  if exists(select 1 from public.draws where event_id=e.id and status='pending') then raise exception 'Сначала завершите текущий розыгрыш'; end if;
  update public.event_screen_state set mode=p_mode, current_prize_id=null, current_draw_id=null,
    countdown_end=case when p_mode='countdown' then clock_timestamp()+make_interval(secs=>p_seconds) else null end
    where event_id=e.id returning * into s;
  if not found then raise exception 'Состояние экрана не найдено'; end if;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id,metadata)
    values(e.id,auth.uid(),'screen_mode_changed','event_screen_state',e.id,
      jsonb_build_object('mode',p_mode,'seconds',p_seconds));
  return to_jsonb(s);
end $$;
revoke all on function public.set_screen_mode(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.set_screen_mode(uuid,text,integer) to authenticated;

-- Apply these rules inside the existing atomic draw transaction as well as UI.
create function public.guard_draw_screen_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.event_screen_state;
begin
  select * into s from public.event_screen_state where event_id=new.event_id;
  if s.mode='paused' then raise exception 'Снимите экран с паузы'; end if;
  if s.mode='countdown' and s.countdown_end>clock_timestamp() then raise exception 'Дождитесь завершения обратного отсчёта'; end if;
  return new;
end $$;
revoke all on function public.guard_draw_screen_mode() from public,anon,authenticated;
create trigger draws_screen_mode before insert on public.draws
  for each row execute function public.guard_draw_screen_mode();
