-- All operational state belongs to PostgreSQL. Extra draw_enabled resolves §22.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','host')),
  display_name text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text, logo_path text,
  status text not null default 'draft' check (status in ('draft','active','finished','archived')),
  registration_enabled boolean not null default true,
  draw_enabled boolean not null default true,
  check_in_required boolean not null default false,
  allow_multiple_wins boolean not null default false,
  require_phone boolean not null default true,
  require_email boolean not null default false,
  show_participant_name boolean not null default true,
  show_ticket_number boolean not null default true,
  ticket_digits integer not null default 3 check (ticket_digits between 1 and 8),
  sound_enabled boolean not null default true,
  confetti_enabled boolean not null default true,
  draw_animation_seconds integer not null default 4 check (draw_animation_seconds between 1 and 15),
  primary_color text not null default '#163c32' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text check (phone is null or phone ~ '^\+7[0-9]{10}$'),
  email text check (email is null or length(email) <= 254),
  ticket_number integer not null check (ticket_number > 0),
  checked_in boolean not null default false, checked_in_at timestamptz,
  is_active boolean not null default true, is_test boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_id, ticket_number), unique(event_id, id),
  check ((checked_in and checked_in_at is not null) or (not checked_in and checked_in_at is null))
);
create unique index participants_phone_unique on public.participants(event_id, phone) where phone is not null;
create index participants_check_in_idx on public.participants(event_id, checked_in);
create index participants_active_idx on public.participants(event_id, is_active);

-- Transactional per-event counter; only service-role registration can allocate tickets.
create table public.event_ticket_counters (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0)
);

create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  description text, image_path text,
  quantity integer not null default 1 check (quantity > 0),
  sort_order integer not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_id, id)
);
create index prizes_event_idx on public.prizes(event_id, sort_order);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  prize_id uuid not null, participant_id uuid not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  participants_count integer not null check (participants_count > 0),
  created_by uuid references auth.users(id) default auth.uid(),
  drawn_at timestamptz not null default now(), confirmed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id, prize_id) references public.prizes(event_id, id),
  foreign key (event_id, participant_id) references public.participants(event_id, id),
  unique(event_id, id),
  check ((status = 'pending' and confirmed_at is null and cancelled_at is null)
    or (status = 'confirmed' and confirmed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and confirmed_at is null and cancelled_at is not null))
);
create unique index draws_one_pending_per_event on public.draws(event_id) where status = 'pending';
create index draws_participant_idx on public.draws(event_id, participant_id, status);
create index draws_prize_idx on public.draws(event_id, prize_id, status);

-- Safe to expose to Realtime: no participant names or contact data.
create table public.event_screen_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  mode text not null default 'waiting' check (mode in ('waiting','countdown','drawing','winner','paused')),
  current_prize_id uuid, current_draw_id uuid, countdown_end timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (event_id, current_prize_id) references public.prizes(event_id, id),
  foreign key (event_id, current_draw_id) references public.draws(event_id, id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_event_idx on public.audit_logs(event_id, created_at);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger participants_touch before update on public.participants for each row execute function public.touch_updated_at();
create trigger prizes_touch before update on public.prizes for each row execute function public.touch_updated_at();
create trigger screen_touch before update on public.event_screen_state for each row execute function public.touch_updated_at();

create function public.initialize_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_screen_state(event_id) values (new.id);
  insert into public.event_ticket_counters(event_id) values (new.id);
  return new;
end $$;
create trigger event_initialize after insert on public.events for each row execute function public.initialize_event();

-- Lock the event before changing eligibility, prize inventory, or screen state.
-- The draw engine uses the same event lock, so staff edits cannot race a draw.
create function public.lock_event_child() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then raise exception 'Event cannot be changed'; end if;
  perform 1 from public.events where id = case when tg_op = 'DELETE' then old.event_id else new.event_id end for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger participants_lock before insert or update or delete on public.participants for each row execute function public.lock_event_child();
create trigger prizes_lock before insert or update or delete on public.prizes for each row execute function public.lock_event_child();

create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_event uuid;
begin
  if tg_table_name = 'events' then
    v_event := new.id;
    v_action := case when tg_op='INSERT' then 'event_created' else 'settings_updated' end;
  elsif tg_table_name = 'prizes' then
    v_event := new.event_id;
    v_action := case when tg_op='INSERT' then 'prize_created' else 'prize_updated' end;
  else
    v_event := new.event_id;
    if tg_op='INSERT' then v_action := 'participant_created';
    elsif old.checked_in is distinct from new.checked_in then v_action := 'check_in';
    elsif not new.is_active then v_action := 'participant_disabled';
    else v_action := 'participant_updated'; end if;
  end if;
  insert into public.audit_logs(event_id,user_id,action,entity_type,entity_id)
    values(v_event, auth.uid(), v_action, tg_table_name, new.id);
  update public.event_screen_state set updated_at = clock_timestamp() where event_id = v_event;
  return new;
end $$;
create trigger events_audit after insert or update on public.events for each row execute function public.audit_change();
create trigger participants_audit after insert or update on public.participants for each row execute function public.audit_change();
create trigger prizes_audit after insert or update on public.prizes for each row execute function public.audit_change();
