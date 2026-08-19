-- A scheduled character is part of a persisted schedule snapshot. Do not let a
-- roster edit silently invalidate the snapshot, its weekly reservation, or a
-- published schedule. Terminal events and waves remain historical records and
-- do not prevent a member from maintaining their roster. Both sides of a
-- schedule/roster race take this transaction-scoped group lock: the roster
-- trigger checks the persisted schedule only while it owns the lock, and the
-- schedule RPC keeps the same lock through validation and slot writes.
create or replace function public.lock_roster_schedule_group(p_group_id uuid)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
$$;

create or replace function public.prevent_scheduled_character_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not (
    new.is_archived is distinct from old.is_archived
    or new.role is distinct from old.role
    or new.game_account_id is distinct from old.game_account_id
    or new.profile_id is distinct from old.profile_id
    or new.group_id is distinct from old.group_id
  ) then
    return new;
  end if;

  perform public.lock_roster_schedule_group(old.group_id);

  if exists (
    select 1
    from public.schedule_slots slot
    join public.raid_waves wave on wave.id = slot.raid_wave_id
    join public.raid_events event on event.id = wave.raid_event_id
    where slot.assigned_character_id = old.id
      and event.group_id = old.group_id
      and event.status in ('draft', 'open', 'published')
      and wave.status in ('draft', 'open', 'published')
  ) then
    raise exception 'scheduled_character_locked';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_scheduled_character_mutation on public.characters;
create trigger prevent_scheduled_character_mutation
before update of is_archived, role, game_account_id, profile_id, group_id on public.characters
for each row execute function public.prevent_scheduled_character_mutation();

create or replace function public.prevent_scheduled_account_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not (
    new.is_archived is distinct from old.is_archived
    or new.profile_id is distinct from old.profile_id
    or new.group_id is distinct from old.group_id
  ) then
    return new;
  end if;

  perform public.lock_roster_schedule_group(old.group_id);

  if exists (
    select 1
    from public.characters character
    join public.schedule_slots slot on slot.assigned_character_id = character.id
    join public.raid_waves wave on wave.id = slot.raid_wave_id
    join public.raid_events event on event.id = wave.raid_event_id
    where character.game_account_id = old.id
      and character.profile_id = old.profile_id
      and character.group_id = old.group_id
      and event.group_id = old.group_id
      and event.status in ('draft', 'open', 'published')
      and wave.status in ('draft', 'open', 'published')
  ) then
    raise exception 'scheduled_account_locked';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_scheduled_account_mutation on public.game_accounts;
create trigger prevent_scheduled_account_mutation
before update of is_archived, profile_id, group_id on public.game_accounts
for each row execute function public.prevent_scheduled_account_mutation();

-- Migration 010 exposes these guarded wrappers and keeps the prior large
-- implementations private as *_atomic. Replacing the wrappers here makes the
-- advisory lock cover their complete validation and write transaction without
-- duplicating those implementations.
create or replace function public.replace_schedule_snapshot(
  p_raid_event_id uuid,
  p_raid_wave_id uuid,
  p_expected_version integer,
  p_snapshot jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_record public.raid_events%rowtype;
  wave_record public.raid_waves%rowtype;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[])
  then raise exception 'schedule_forbidden'; end if;
  if event_record.status in ('completed', 'archived') then raise exception 'schedule_closed'; end if;

  perform public.lock_roster_schedule_group(event_record.group_id);

  select wave.* into wave_record
  from public.raid_waves wave
  where wave.id = p_raid_wave_id and wave.raid_event_id = p_raid_event_id
  for update;
  if not found then raise exception 'wave_not_found'; end if;
  if wave_record.status in ('completed', 'archived') then raise exception 'schedule_closed'; end if;

  return public.replace_schedule_snapshot_atomic(
    p_raid_event_id, p_raid_wave_id, p_expected_version, p_snapshot
  );
end;
$$;

create or replace function public.replace_event_schedule_snapshots(
  p_raid_event_id uuid,
  p_expected_versions jsonb,
  p_snapshots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_record public.raid_events%rowtype;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[])
  then raise exception 'schedule_forbidden'; end if;
  if event_record.status in ('completed', 'archived') then raise exception 'schedule_closed'; end if;
  if exists (
    select 1 from public.raid_waves wave
    where wave.raid_event_id = p_raid_event_id and wave.status in ('completed', 'archived')
  ) then raise exception 'schedule_closed'; end if;

  perform public.lock_roster_schedule_group(event_record.group_id);

  return public.replace_event_schedule_snapshots_atomic(
    p_raid_event_id, p_expected_versions, p_snapshots
  );
end;
$$;
