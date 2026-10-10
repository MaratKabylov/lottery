create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
create function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','host'))
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.event_ticket_counters enable row level security;
alter table public.prizes enable row level security;
alter table public.draws enable row level security;
alter table public.event_screen_state enable row level security;
alter table public.audit_logs enable row level security;

-- Explicit table privileges, in addition to RLS. No public access to raw contacts.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.events, public.participants, public.prizes, public.draws, public.audit_logs to authenticated;
grant insert, update, delete on public.events, public.prizes to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant update (is_active, checked_in, checked_in_at) on public.participants to authenticated;
grant select on public.event_screen_state to anon, authenticated;
grant all on all tables in schema public to service_role;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy events_read on public.events for select to authenticated using (public.is_staff());
create policy events_admin on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy participants_admin_read on public.participants for select to authenticated using (public.is_admin());
create policy participants_admin_update on public.participants for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy prizes_read on public.prizes for select to authenticated using (public.is_staff());
create policy prizes_admin on public.prizes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy draws_staff_read on public.draws for select to authenticated using (public.is_staff());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Intentionally owner-executed, with an explicit projection and publication filter.
-- These are the only columns that a public visitor may read from events.
create view public.public_event_view with (security_barrier = true) as
  select id,name,slug,description,logo_path,primary_color,status,registration_enabled,
    require_phone,require_email,ticket_digits,check_in_required
  from public.events where status in ('active','finished');
grant select on public.public_event_view to anon, authenticated;
create policy screen_public_read on public.event_screen_state for select to anon, authenticated
  using (exists(select 1 from public.public_event_view e where e.id = event_id));

create view public.event_stats with (security_invoker = true) as
  select e.id as event_id,
    (select count(*) from public.participants p where p.event_id=e.id and not p.is_test) as participants_count,
    (select count(*) from public.participants p where p.event_id=e.id and p.checked_in and not p.is_test) as checked_in_count,
    (select count(distinct d.participant_id) from public.draws d where d.event_id=e.id and d.status='confirmed') as confirmed_winners_count,
    (select coalesce(sum(p.quantity),0) from public.prizes p where p.event_id=e.id and p.is_active)
      - (select count(*) from public.draws d join public.prizes p on p.id=d.prize_id where d.event_id=e.id and d.status='confirmed' and p.is_active) as remaining_prizes_count
  from public.events e;
create view public.prize_stats with (security_invoker = true) as
  select p.*, (select count(*) from public.draws d where d.prize_id=p.id and d.status='confirmed') as awarded_count from public.prizes p;
create view public.confirmed_winners with (security_invoker = true) as
  select d.*,p.name as participant_name,p.ticket_number,pr.name as prize_name
  from public.draws d join public.participants p on p.id=d.participant_id join public.prizes pr on pr.id=d.prize_id
  where d.status='confirmed';
grant select on public.event_stats, public.prize_stats, public.confirmed_winners to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('event-assets','event-assets',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy assets_read on storage.objects for select to anon, authenticated using (bucket_id='event-assets');
create policy assets_admin_insert on storage.objects for insert to authenticated with check (bucket_id='event-assets' and public.is_admin());
create policy assets_admin_update on storage.objects for update to authenticated using (bucket_id='event-assets' and public.is_admin()) with check (bucket_id='event-assets' and public.is_admin());
create policy assets_admin_delete on storage.objects for delete to authenticated using (bucket_id='event-assets' and public.is_admin());

-- Default EXECUTE is PUBLIC in PostgreSQL: remove it even for trigger helpers.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_staff() to authenticated;
alter publication supabase_realtime add table public.event_screen_state;
