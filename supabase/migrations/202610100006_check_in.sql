-- Keep retries from changing the original attendance time or generating audit noise.
create or replace function public.staff_check_in(p_event_id uuid,p_ticket_number integer,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.participants;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  if p_checked_in is null then raise exception 'Укажите состояние присутствия'; end if;
  if p_ticket_number is null or p_ticket_number < 1 then raise exception 'Укажите корректный номер билета'; end if;
  perform 1 from public.events where id=p_event_id for update;
  select * into p from public.participants where event_id=p_event_id and ticket_number=p_ticket_number;
  if not found then raise exception 'Участник не найден'; end if;
  if p.checked_in is distinct from p_checked_in then
    update public.participants set checked_in=p_checked_in,
      checked_in_at=case when p_checked_in then clock_timestamp() else null end
      where id=p.id returning * into p;
  end if;
  p.phone := null; p.email := null;
  return to_jsonb(p);
end $$;

create function public.staff_check_in_by_phone(p_event_id uuid,p_phone text,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare digits text; ticket integer;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
  if p_phone is null or length(p_phone) > 40 or p_phone !~ '^[+0-9[:space:]()-]+$' then
    raise exception 'Укажите телефон в формате +7XXXXXXXXXX';
  end if;
  digits := regexp_replace(p_phone,'[^0-9]','','g');
  if length(digits)=11 and left(digits,1)='8' then digits := '7' || substr(digits,2); end if;
  if digits !~ '^7[0-9]{10}$' then raise exception 'Укажите телефон в формате +7XXXXXXXXXX'; end if;
  -- Use the same event lock as the draw engine and ticket-based check-in.
  perform 1 from public.events where id=p_event_id for update;
  select ticket_number into ticket from public.participants where event_id=p_event_id and phone='+' || digits;
  if not found then raise exception 'Участник не найден'; end if;
  return public.staff_check_in(p_event_id,ticket,p_checked_in);
end $$;

revoke all on function public.staff_check_in(uuid,integer,boolean) from public,anon;
revoke all on function public.staff_check_in_by_phone(uuid,text,boolean) from public,anon;
grant execute on function public.staff_check_in(uuid,integer,boolean) to authenticated;
grant execute on function public.staff_check_in_by_phone(uuid,text,boolean) to authenticated;
