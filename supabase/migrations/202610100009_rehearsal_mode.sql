-- Test mode is persisted in screen state and each draw records its origin.
-- Existing draws remain production draws; normal mode remains the default.
alter table public.event_screen_state add column rehearsal_mode boolean not null default false;
alter table public.draws add column is_test boolean not null default false;

create or replace function public.guard_prize_inventory() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity < (select count(*) from public.draws where prize_id=new.id and status in ('pending','confirmed') and not is_test) then
    raise exception 'Количество меньше уже зарезервированных призов';
  end if;
  return new;
end $$;

create or replace function public.get_staff_stats(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rehearsal boolean;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  select rehearsal_mode into rehearsal from public.event_screen_state where event_id=p_event_id;
  return jsonb_build_object(
    'participants_count',(select count(*) from public.participants where event_id=p_event_id and is_test=rehearsal),
    'checked_in_count',(select count(*) from public.participants where event_id=p_event_id and is_test=rehearsal and checked_in),
    'confirmed_winners_count',(select count(distinct participant_id) from public.draws where event_id=p_event_id and status='confirmed' and is_test=rehearsal)
  );
end $$;

create or replace view public.event_stats with (security_invoker = true) as
  select e.id as event_id,
    (select count(*) from public.participants p where p.event_id=e.id and not p.is_test) as participants_count,
    (select count(*) from public.participants p where p.event_id=e.id and p.checked_in and not p.is_test) as checked_in_count,
    (select count(distinct d.participant_id) from public.draws d where d.event_id=e.id and d.status='confirmed' and not d.is_test) as confirmed_winners_count,
    (select coalesce(sum(p.quantity),0) from public.prizes p where p.event_id=e.id and p.is_active)
      - (select count(*) from public.draws d join public.prizes p on p.id=d.prize_id where d.event_id=e.id and d.status='confirmed' and not d.is_test and p.is_active) as remaining_prizes_count
  from public.events e;
create or replace view public.prize_stats with (security_invoker = true) as
  select p.*, (select count(*) from public.draws d where d.prize_id=p.id and d.status='confirmed' and not d.is_test) as awarded_count from public.prizes p;
-- Keep the existing view's column order; expose only production winners.
create or replace view public.confirmed_winners with (security_invoker = true) as
  select d.id,d.event_id,d.prize_id,d.participant_id,d.status,d.participants_count,d.created_by,d.drawn_at,d.confirmed_at,d.cancelled_at,d.created_at,
    p.name as participant_name,p.ticket_number,pr.name as prize_name
  from public.draws d join public.participants p on p.id=d.participant_id join public.prizes pr on pr.id=d.prize_id
  where d.status='confirmed' and not d.is_test;

create function public.set_rehearsal_mode(p_event_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; s public.event_screen_state;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Укажите режим розыгрыша'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or e.status<>'active' then raise exception 'Мероприятие не активно'; end if;
  if exists(select 1 from public.draws where event_id=e.id and status='pending') then raise exception 'Сначала завершите текущий розыгрыш'; end if;
  select * into s from public.event_screen_state where event_id=e.id;
  if s.rehearsal_mode=p_enabled then return to_jsonb(s); end if;
  update public.event_screen_state set rehearsal_mode=p_enabled,mode='waiting',current_prize_id=null,current_draw_id=null,countdown_end=null
    where event_id=e.id returning * into s;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id,metadata)
    values(e.id,auth.uid(),'rehearsal_mode_changed','event_screen_state',e.id,jsonb_build_object('enabled',p_enabled));
  return to_jsonb(s);
end $$;
revoke all on function public.set_rehearsal_mode(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_rehearsal_mode(uuid,boolean) to authenticated;

create or replace function public.draw_winner(p_event_id uuid, p_prize_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; pr public.prizes; d public.draws; winner uuid; candidates uuid[]; rehearsal boolean;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or e.status <> 'active' or not e.draw_enabled then raise exception 'Розыгрыш недоступен'; end if;
  select * into pr from public.prizes where id=p_prize_id and event_id=e.id;
  if not found or not pr.is_active then raise exception 'Приз недоступен'; end if;
  -- Returning the existing pending draw makes double clicks and retries idempotent.
  select * into d from public.draws where event_id=e.id and status='pending';
  if found then
    if d.prize_id <> p_prize_id then raise exception 'Сначала завершите текущий розыгрыш'; end if;
    return to_jsonb(d);
  end if;
  select rehearsal_mode into rehearsal from public.event_screen_state where event_id=e.id;
  if not rehearsal and (select count(*) from public.draws where prize_id=pr.id and status='confirmed' and not is_test) >= pr.quantity then raise exception 'Все экземпляры приза уже выданы'; end if;
  select array_agg(p.id order by p.id) into candidates from public.participants p
  where p.event_id=e.id and p.is_active and p.is_test=rehearsal
    and (rehearsal or not e.check_in_required or p.checked_in)
    and (e.allow_multiple_wins or not exists(select 1 from public.draws previous
      where previous.event_id=e.id and previous.participant_id=p.id and previous.status='confirmed' and previous.is_test=rehearsal));
  if coalesce(cardinality(candidates),0)=0 then
    if rehearsal then raise exception 'Нет подходящих тестовых участников. Добавьте тестовых гостей или разрешите повторный выигрыш для репетиции.'; end if;
    raise exception 'Нет подходящих участников';
  end if;
  -- The server selects uniformly from the locked eligibility snapshot.
  winner := candidates[1+floor(random()*cardinality(candidates))::integer];
  insert into public.draws(event_id,prize_id,participant_id,participants_count,is_test)
    values(e.id,pr.id,winner,cardinality(candidates),rehearsal) returning * into d;
  update public.event_screen_state set mode='drawing',current_prize_id=pr.id,current_draw_id=d.id,
    countdown_end=clock_timestamp()+make_interval(secs=>e.draw_animation_seconds) where event_id=e.id;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id,metadata)
    values(e.id,auth.uid(),'draw_started','draws',d.id,jsonb_build_object('participants_count',cardinality(candidates),'is_test',rehearsal));
  return to_jsonb(d);
end $$;

create or replace function public.get_public_screen(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.events; s public.event_screen_state; result jsonb;
begin
  select * into e from public.events where slug=p_slug and (status in ('active','finished') or public.is_staff());
  if not found then raise exception 'Мероприятие не найдено'; end if;
  select * into s from public.event_screen_state where event_id=e.id;
  select jsonb_build_object(
    'event', jsonb_build_object('id',e.id,'name',e.name,'slug',e.slug,'description',e.description,'logo_path',e.logo_path,
      'primary_color',e.primary_color,'status',e.status,'registration_enabled',e.registration_enabled,
      'require_phone',e.require_phone,'require_email',e.require_email,'ticket_digits',e.ticket_digits,
      'check_in_required',e.check_in_required,'confetti_enabled',e.confetti_enabled,'sound_enabled',e.sound_enabled),
    'state',to_jsonb(s),
    'participant_count',(select count(*) from public.participants where event_id=e.id and is_test=s.rehearsal_mode),
    'prize',(select jsonb_build_object('name',name,'description',description,'image_path',image_path) from public.prizes where id=s.current_prize_id),
    'winner',(select jsonb_build_object('name',case when e.show_participant_name then p.name else null end,
      'ticket_number',case when e.show_ticket_number then p.ticket_number else null end,'status',d.status)
      from public.draws d join public.participants p on p.id=d.participant_id where d.id=s.current_draw_id),
    'server_time',clock_timestamp()
  ) into result;
  return result;
end $$;

