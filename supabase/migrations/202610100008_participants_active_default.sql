-- New registrations use this default inside register_participant.
-- Preserve the status of existing participants, including staff-disabled guests.
alter table public.participants alter column is_active set default true;
