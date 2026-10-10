create function public.register_participant(p_event_slug text, p_name text, p_phone text default null, p_email text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.participants; n integer;
begin
  -- This function is callable only by the Edge Function's service-role client.
  select * into e from public.events where slug=p_event_slug for update;
  if not found or e.status <> 'active' or not e.registration_enabled then raise exception 'Регистрация закрыта'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Укажите имя (до 120 символов)'; end if;
  p_phone := nullif(trim(p_phone),''); p_email := nullif(lower(trim(p_email)),'');
  if e.require_phone and p_phone is null then raise exception 'Укажите телефон'; end if;
  if e.require_email and p_email is null then raise exception 'Укажите email'; end if;
  if p_phone is not null and p_phone !~ '^\+7[0-9]{10}$' then raise exception 'Некорректный телефон'; end if;
  if p_email is not null and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Некорректный email'; end if;
  if p_phone is not null then
    select * into p from public.participants where event_id=e.id and phone=p_phone;
    if found then return jsonb_build_object('success',true,'already_registered',true,'participant_id',p.id,'ticket_number',p.ticket_number); end if;
  end if;
  update public.event_ticket_counters set last_number=last_number+1 where event_id=e.id returning last_number into n;
  insert into public.participants(event_id,name,phone,email,ticket_number)
    values(e.id,trim(p_name),p_phone,p_email,n) returning * into p;
  return jsonb_build_object('success',true,'already_registered',false,'participant_id',p.id,'ticket_number',n);
end $$;

create function public.draw_winner(p_event_id uuid, p_prize_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; pr public.prizes; d public.draws; winner uuid; candidates uuid[];
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
  if (select count(*) from public.draws where prize_id=pr.id and status='confirmed') >= pr.quantity then raise exception 'Все экземпляры приза уже выданы'; end if;
  select array_agg(p.id order by p.id) into candidates from public.participants p
  where p.event_id=e.id and p.is_active and not p.is_test
    and (not e.check_in_required or p.checked_in)
    and (e.allow_multiple_wins or not exists(select 1 from public.draws previous
      where previous.event_id=e.id and previous.participant_id=p.id and previous.status='confirmed'));
  if coalesce(cardinality(candidates),0)=0 then raise exception 'Нет подходящих участников'; end if;
  -- The server selects uniformly from the locked eligibility snapshot.
  winner := candidates[1+floor(random()*cardinality(candidates))::integer];
  insert into public.draws(event_id,prize_id,participant_id,participants_count)
    values(e.id,pr.id,winner,cardinality(candidates)) returning * into d;
  update public.event_screen_state set mode='drawing',current_prize_id=pr.id,current_draw_id=d.id,
    countdown_end=clock_timestamp()+make_interval(secs=>e.draw_animation_seconds) where event_id=e.id;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id,metadata)
    values(e.id,auth.uid(),'draw_started','draws',d.id,jsonb_build_object('participants_count',cardinality(candidates)));
  return to_jsonb(d);
end $$;

create function public.confirm_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.draws; event_uuid uuid; ends_at timestamptz;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  select event_id into event_uuid from public.draws where id=p_draw_id;
  if not found then raise exception 'Розыгрыш не найден'; end if;
  perform 1 from public.events where id=event_uuid for update;
  select * into d from public.draws where id=p_draw_id;
  if d.status='confirmed' then return to_jsonb(d); end if;
  if d.status <> 'pending' then raise exception 'Розыгрыш уже завершён'; end if;
  select countdown_end into ends_at from public.event_screen_state where event_id=event_uuid;
  if ends_at>clock_timestamp() then raise exception 'Дождитесь завершения анимации'; end if;
  update public.draws set status='confirmed',confirmed_at=clock_timestamp() where id=d.id returning * into d;
  update public.event_screen_state set mode='winner' where event_id=d.event_id;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id) values(d.event_id,auth.uid(),'draw_confirmed','draws',d.id);
  return to_jsonb(d);
end $$;

create function public.cancel_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.draws; event_uuid uuid;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  select event_id into event_uuid from public.draws where id=p_draw_id;
  if not found then raise exception 'Розыгрыш не найден'; end if;
  perform 1 from public.events where id=event_uuid for update;
  select * into d from public.draws where id=p_draw_id;
  if d.status='cancelled' then return to_jsonb(d); end if;
  if d.status <> 'pending' then raise exception 'Розыгрыш уже завершён'; end if;
  update public.draws set status='cancelled',cancelled_at=clock_timestamp() where id=d.id returning * into d;
  update public.event_screen_state set mode='waiting',current_draw_id=null,countdown_end=null where event_id=d.event_id;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id) values(d.event_id,auth.uid(),'draw_cancelled','draws',d.id);
  return to_jsonb(d);
end $$;

create function public.staff_check_in(p_event_id uuid,p_ticket_number integer,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.participants;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  perform 1 from public.events where id=p_event_id for update;
  update public.participants set checked_in=p_checked_in,checked_in_at=case when p_checked_in then clock_timestamp() else null end
    where event_id=p_event_id and ticket_number=p_ticket_number returning * into p;
  if not found then raise exception 'Участник не найден'; end if;
  -- Hosts receive only the ticket/name needed to check attendance, never contact data.
  p.phone := null; p.email := null;
  return to_jsonb(p);
end $$;

create function public.get_public_screen(p_slug text)
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
    'participant_count',(select count(*) from public.participants where event_id=e.id and not is_test),
    'prize',(select jsonb_build_object('name',name,'description',description,'image_path',image_path) from public.prizes where id=s.current_prize_id),
    'winner',(select jsonb_build_object('name',case when e.show_participant_name then p.name else null end,
      'ticket_number',case when e.show_ticket_number then p.ticket_number else null end,'status',d.status)
      from public.draws d join public.participants p on p.id=d.participant_id where d.id=s.current_draw_id),
    'server_time',clock_timestamp()
  ) into result;
  return result;
end $$;

-- Limit quantity edits after inventory has been reserved or awarded.
create function public.guard_prize_inventory() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity < (select count(*) from public.draws where prize_id=new.id and status in ('pending','confirmed')) then
    raise exception 'Количество меньше уже зарезервированных призов';
  end if;
  return new;
end $$;
create trigger prizes_quantity before update on public.prizes for each row execute function public.guard_prize_inventory();

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(),public.is_staff() to authenticated;
grant execute on function public.get_public_screen(text) to anon, authenticated;
grant execute on function public.draw_winner(uuid,uuid),public.confirm_draw(uuid),public.cancel_draw(uuid),public.staff_check_in(uuid,integer,boolean) to authenticated;
grant execute on function public.register_participant(text,text,text,text) to service_role;

-- Durable request throttling shared across Edge Function instances, not process memory.
create table public.registration_rate_limits (
  key_hash text primary key, window_started timestamptz not null default now(), hits integer not null default 1
);
alter table public.registration_rate_limits enable row level security;
revoke all on public.registration_rate_limits from anon, authenticated;
create function public.consume_registration_limit(p_key_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if length(p_key_hash) <> 64 then raise exception 'Invalid throttle key'; end if;
  -- Opportunistic retention: discard old hashed addresses.
  delete from public.registration_rate_limits where window_started < now()-interval '1 day';
  insert into public.registration_rate_limits(key_hash) values(p_key_hash)
    on conflict(key_hash) do update set
      hits=case when registration_rate_limits.window_started<now()-interval '1 minute' then 1 else registration_rate_limits.hits+1 end,
      window_started=case when registration_rate_limits.window_started<now()-interval '1 minute' then now() else registration_rate_limits.window_started end
    returning hits into n;
  return n<=10;
end $$;
revoke all on function public.consume_registration_limit(text) from public,anon,authenticated;
grant execute on function public.consume_registration_limit(text) to service_role;
