-- Opt-in advertising on the public screen. Existing events keep their layout.
alter table public.events
  add column screen_banner_enabled boolean not null default false,
  add column screen_banner_path text,
  add constraint events_screen_banner_required check (
    not screen_banner_enabled or nullif(btrim(screen_banner_path), '') is not null
  );

-- Keep the existing event access checks and safe snapshot, adding only banner settings.
create or replace function public.get_public_screen(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_event public.events; snapshot jsonb;
begin
  select * into v_event from public.events where slug = p_slug;
  if not found or (v_event.status not in ('active','finished') and not public.can_access_event(v_event.id)) then
    raise exception 'Мероприятие не найдено';
  end if;
  snapshot := public.get_public_screen_unscoped(p_slug);
  return jsonb_set(snapshot, '{event}', (snapshot->'event') || jsonb_build_object(
    'screen_banner_enabled', v_event.screen_banner_enabled,
    'screen_banner_path', v_event.screen_banner_path
  ));
end $$;

revoke execute on function public.get_public_screen(text) from public, anon, authenticated;
grant execute on function public.get_public_screen(text) to anon, authenticated;
