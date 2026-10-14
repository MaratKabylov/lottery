-- Co-administrators have the same management rights as the owner, but only for
-- events to which they are explicitly assigned through event_staff.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'coadmin', 'host'));

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'coadmin', 'host')
  )
$$;

create function public.is_coadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'coadmin'
  )
$$;

-- Keep the existing function name so all established RLS policies and RPC
-- wrappers gain co-administrator support atomically.
create or replace function public.is_event_owner(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    join public.profiles p on p.id = auth.uid()
    where e.id = p_event_id
      and (
        (e.created_by = auth.uid() and p.role = 'admin')
        or (
          p.role = 'coadmin'
          and exists (
            select 1 from public.event_staff es
            where es.event_id = e.id and es.user_id = auth.uid()
          )
        )
      )
  )
$$;

create or replace function public.can_access_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_event_owner(p_event_id) or exists (
    select 1 from public.event_staff es
    join public.profiles p on p.id = es.user_id
      and p.role in ('host', 'coadmin')
    where es.event_id = p_event_id and es.user_id = auth.uid()
  )
$$;

-- A co-administrator needs to see assignable staff profiles in event settings.
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_coadmin());

drop policy event_staff_owner_insert on public.event_staff;
create policy event_staff_owner_insert on public.event_staff for insert to authenticated
  with check (
    public.is_event_owner(event_id)
    and exists (
      select 1 from public.profiles p
      where p.id = user_id and p.role in ('host', 'coadmin')
    )
  );

create or replace function public.can_manage_event_asset(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where public.is_event_owner(e.id)
      and p_name like 'events/' || e.id::text || '/%'
  )
$$;

revoke execute on function public.is_coadmin() from public, anon, authenticated;
grant execute on function public.is_coadmin() to authenticated;
