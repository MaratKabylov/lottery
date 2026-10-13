-- Events are private to their creator. Hosts receive access explicitly through
-- event_staff. Keep every check in the database so UUID-based RPC calls cannot
-- bypass the UI or row-level security.
create table public.event_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_staff_user_idx on public.event_staff(user_id, event_id);
alter table public.event_staff enable row level security;

create function public.set_event_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger event_set_owner before insert on public.events
for each row execute function public.set_event_owner();

create function public.is_event_owner(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.created_by = auth.uid()
      and public.is_admin()
  )
$$;

create function public.can_access_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.created_by = auth.uid()
  ) or exists (
    select 1 from public.event_staff es
    join public.profiles p on p.id = es.user_id and p.role = 'host'
    where es.event_id = p_event_id and es.user_id = auth.uid()
  )
$$;

grant select, insert, delete on public.event_staff to authenticated;
create policy event_staff_read on public.event_staff for select to authenticated
  using (user_id = auth.uid() or public.is_event_owner(event_id));
create policy event_staff_owner_insert on public.event_staff for insert to authenticated
  with check (
    public.is_event_owner(event_id)
    and exists (select 1 from public.profiles p where p.id = user_id and p.role = 'host')
  );
create policy event_staff_owner_delete on public.event_staff for delete to authenticated
  using (public.is_event_owner(event_id));

drop policy events_read on public.events;
drop policy events_admin on public.events;
create policy events_read on public.events for select to authenticated
  using (public.can_access_event(id));
create policy events_owner_insert on public.events for insert to authenticated
  with check (public.is_admin());
create policy events_owner_update on public.events for update to authenticated
  using (public.is_event_owner(id)) with check (public.is_event_owner(id));
create policy events_owner_delete on public.events for delete to authenticated
  using (public.is_event_owner(id));

drop policy participants_admin_read on public.participants;
drop policy participants_admin_update on public.participants;
create policy participants_owner_read on public.participants for select to authenticated
  using (public.is_event_owner(event_id));
create policy participants_owner_update on public.participants for update to authenticated
  using (public.is_event_owner(event_id)) with check (public.is_event_owner(event_id));

drop policy prizes_read on public.prizes;
drop policy prizes_admin on public.prizes;
create policy prizes_read on public.prizes for select to authenticated
  using (public.can_access_event(event_id));
create policy prizes_owner_insert on public.prizes for insert to authenticated
  with check (public.is_event_owner(event_id));
create policy prizes_owner_update on public.prizes for update to authenticated
  using (public.is_event_owner(event_id)) with check (public.is_event_owner(event_id));
create policy prizes_owner_delete on public.prizes for delete to authenticated
  using (public.is_event_owner(event_id));

drop policy draws_staff_read on public.draws;
create policy draws_staff_read on public.draws for select to authenticated
  using (public.can_access_event(event_id));

drop policy audit_admin_read on public.audit_logs;
create policy audit_owner_read on public.audit_logs for select to authenticated
  using (public.is_event_owner(event_id));

drop policy screen_public_read on public.event_screen_state;
create policy screen_public_read on public.event_screen_state for select to anon, authenticated
  using (
    exists(select 1 from public.public_event_view e where e.id = event_id)
    or public.can_access_event(event_id)
  );

create function public.can_manage_event_asset(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.created_by = auth.uid()
      and public.is_admin()
      and p_name like 'events/' || e.id::text || '/%'
  )
$$;
drop policy assets_admin_insert on storage.objects;
drop policy assets_admin_update on storage.objects;
drop policy assets_admin_delete on storage.objects;
create policy assets_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.can_manage_event_asset(name));
create policy assets_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'event-assets' and public.can_manage_event_asset(name))
  with check (bucket_id = 'event-assets' and public.can_manage_event_asset(name));
create policy assets_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.can_manage_event_asset(name));

create function public.create_event(p_name text,p_slug text,p_description text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Доступ запрещён' using errcode='42501';
  end if;
  insert into public.events(name,slug,description,created_by)
    values(p_name,p_slug,p_description,auth.uid()) returning * into e;
  return to_jsonb(e);
end $$;

-- Preserve the existing, tested implementations behind access-checking wrappers.
alter function public.draw_winner(uuid, uuid) rename to draw_winner_unscoped;
alter function public.confirm_draw(uuid) rename to confirm_draw_unscoped;
alter function public.cancel_draw(uuid) rename to cancel_draw_unscoped;
alter function public.staff_check_in(uuid, integer, boolean) rename to staff_check_in_unscoped;
alter function public.staff_check_in_by_phone(uuid, text, boolean) rename to staff_check_in_by_phone_unscoped;
alter function public.get_staff_stats(uuid) rename to get_staff_stats_unscoped;
alter function public.manage_test_participants(uuid, integer, boolean) rename to manage_test_participants_unscoped;
alter function public.set_screen_mode(uuid, text, integer) rename to set_screen_mode_unscoped;
alter function public.set_rehearsal_mode(uuid, boolean) rename to set_rehearsal_mode_unscoped;
alter function public.get_public_screen(text) rename to get_public_screen_unscoped;

revoke all on function public.draw_winner_unscoped(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_draw_unscoped(uuid) from public, anon, authenticated;
revoke all on function public.cancel_draw_unscoped(uuid) from public, anon, authenticated;
revoke all on function public.staff_check_in_unscoped(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.staff_check_in_by_phone_unscoped(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.get_staff_stats_unscoped(uuid) from public, anon, authenticated;
revoke all on function public.manage_test_participants_unscoped(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.set_screen_mode_unscoped(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.set_rehearsal_mode_unscoped(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_public_screen_unscoped(text) from public, anon, authenticated;

create function public.draw_winner(p_event_id uuid, p_prize_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.draw_winner_unscoped(p_event_id, p_prize_id);
end $$;
create function public.confirm_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid;
begin
  select event_id into v_event_id from public.draws where id = p_draw_id;
  if v_event_id is null or not public.can_access_event(v_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.confirm_draw_unscoped(p_draw_id);
end $$;
create function public.cancel_draw(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid;
begin
  select event_id into v_event_id from public.draws where id = p_draw_id;
  if v_event_id is null or not public.can_access_event(v_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.cancel_draw_unscoped(p_draw_id);
end $$;
create function public.staff_check_in(p_event_id uuid,p_ticket_number integer,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.staff_check_in_unscoped(p_event_id,p_ticket_number,p_checked_in);
end $$;
create function public.staff_check_in_by_phone(p_event_id uuid,p_phone text,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.staff_check_in_by_phone_unscoped(p_event_id,p_phone,p_checked_in);
end $$;
create function public.get_staff_stats(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.get_staff_stats_unscoped(p_event_id);
end $$;
create function public.manage_test_participants(p_event_id uuid,p_count integer default 0,p_remove boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_event_owner(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.manage_test_participants_unscoped(p_event_id,p_count,p_remove);
end $$;
create function public.set_screen_mode(p_event_id uuid,p_mode text,p_seconds integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.set_screen_mode_unscoped(p_event_id,p_mode,p_seconds);
end $$;
create function public.set_rehearsal_mode(p_event_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_event(p_event_id) then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  return public.set_rehearsal_mode_unscoped(p_event_id,p_enabled);
end $$;
create function public.get_public_screen(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_event public.events;
begin
  select * into v_event from public.events where slug = p_slug;
  if not found or (v_event.status not in ('active','finished') and not public.can_access_event(v_event.id)) then
    raise exception 'Мероприятие не найдено';
  end if;
  return public.get_public_screen_unscoped(p_slug);
end $$;

revoke execute on function public.set_event_owner(), public.is_event_owner(uuid), public.can_access_event(uuid), public.can_manage_event_asset(text) from public, anon, authenticated;
grant execute on function public.is_event_owner(uuid), public.can_manage_event_asset(text) to authenticated;
-- The public screen policy invokes this helper for both roles. Anonymous callers
-- always receive false because auth.uid() is null.
grant execute on function public.can_access_event(uuid) to anon, authenticated;
revoke execute on function public.draw_winner(uuid,uuid), public.confirm_draw(uuid), public.cancel_draw(uuid), public.staff_check_in(uuid,integer,boolean), public.staff_check_in_by_phone(uuid,text,boolean), public.get_staff_stats(uuid), public.manage_test_participants(uuid,integer,boolean), public.set_screen_mode(uuid,text,integer), public.set_rehearsal_mode(uuid,boolean), public.get_public_screen(text) from public, anon, authenticated;
revoke execute on function public.create_event(text,text,text) from public, anon, authenticated;
grant execute on function public.create_event(text,text,text) to authenticated;
grant execute on function public.draw_winner(uuid,uuid), public.confirm_draw(uuid), public.cancel_draw(uuid), public.staff_check_in(uuid,integer,boolean), public.staff_check_in_by_phone(uuid,text,boolean), public.get_staff_stats(uuid), public.manage_test_participants(uuid,integer,boolean), public.set_screen_mode(uuid,text,integer), public.set_rehearsal_mode(uuid,boolean) to authenticated;
grant execute on function public.get_public_screen(text) to anon, authenticated;
