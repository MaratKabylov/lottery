-- When enabled, a draw assigns one of the remaining prize units on the server.
alter table public.events
  add column random_prize_assignment boolean not null default false;

create or replace function public.draw_winner(p_event_id uuid, p_prize_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; pr public.prizes; d public.draws; winner uuid; candidates uuid[]; rehearsal boolean;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or e.status <> 'active' or not e.draw_enabled then raise exception 'Розыгрыш недоступен'; end if;

  -- Returning the existing pending draw makes double clicks and retries idempotent,
  -- including retries where the client no longer knows the randomly assigned prize.
  select * into d from public.draws where event_id=e.id and status='pending';
  if found then
    if not e.random_prize_assignment and d.prize_id <> p_prize_id then raise exception 'Сначала завершите текущий розыгрыш'; end if;
    return to_jsonb(d);
  end if;

  select rehearsal_mode into rehearsal from public.event_screen_state where event_id=e.id;
  if e.random_prize_assignment then
    if rehearsal then
      -- Rehearsals do not consume inventory, so each active prize is equally likely.
      select p.* into pr
      from public.prizes p
      where p.event_id=e.id and p.is_active
      order by random()
      limit 1;
    else
      -- Pick against cumulative remaining inventory. This makes every physical
      -- prize unit equally likely without expanding large quantities into rows.
      with inventory as (
        select p.id,
          p.quantity - (select count(*)::integer from public.draws awarded
            where awarded.prize_id=p.id and awarded.status='confirmed' and not awarded.is_test) as remaining,
          p.sort_order
        from public.prizes p
        where p.event_id=e.id and p.is_active
      ), weighted as (
        select i.*,
          sum(i.remaining) over (order by i.sort_order,i.id) as cumulative
        from inventory i
        where i.remaining > 0
      ), pick as (
        select 1 + floor(random() * max(w.cumulative))::bigint as target
        from weighted w
      )
      select p.* into pr
      from weighted w
      cross join pick x
      join public.prizes p on p.id=w.id
      where x.target > w.cumulative-w.remaining and x.target <= w.cumulative;
    end if;
    if not found then raise exception 'Все активные призы разыграны или ещё не добавлены'; end if;
  else
    if p_prize_id is null then raise exception 'Выберите приз'; end if;
    select * into pr from public.prizes where id=p_prize_id and event_id=e.id;
    if not found or not pr.is_active then raise exception 'Приз недоступен'; end if;
    if not rehearsal and (select count(*) from public.draws where prize_id=pr.id and status='confirmed' and not is_test) >= pr.quantity then
      raise exception 'Все экземпляры приза уже выданы';
    end if;
  end if;

  select array_agg(p.id order by p.id) into candidates from public.participants p
  where p.event_id=e.id and p.is_active and p.is_test=rehearsal
    and (rehearsal or not e.check_in_required or p.checked_in)
    and (e.allow_multiple_wins or not exists(select 1 from public.draws previous
      where previous.event_id=e.id and previous.participant_id=p.id and previous.status='confirmed' and previous.is_test=rehearsal));
  if coalesce(cardinality(candidates),0)=0 then
    if rehearsal then raise exception 'Нет подходящих тестовых участников. Добавьте тестовых гостей или разрешите повторный выигрыш для репетиции.'; end if;
    raise exception 'Нет подходящих участников';
  end if;
  winner := candidates[1+floor(random()*cardinality(candidates))::integer];
  insert into public.draws(event_id,prize_id,participant_id,participants_count,is_test)
    values(e.id,pr.id,winner,cardinality(candidates),rehearsal) returning * into d;
  update public.event_screen_state set mode='drawing',current_prize_id=pr.id,current_draw_id=d.id,
    countdown_end=clock_timestamp()+make_interval(secs=>e.draw_animation_seconds) where event_id=e.id;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id,metadata)
    values(e.id,auth.uid(),'draw_started','draws',d.id,jsonb_build_object(
      'participants_count',cardinality(candidates),
      'is_test',rehearsal,
      'random_prize_assignment',e.random_prize_assignment,
      'prize_id',pr.id
    ));
  return to_jsonb(d);
end $$;
