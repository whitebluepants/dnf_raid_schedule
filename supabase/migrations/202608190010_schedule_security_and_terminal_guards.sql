-- Atomic activity and scheduling state is read directly but mutated only through
-- audited security-definer functions.
revoke insert, update, delete on table public.raid_events from authenticated;
revoke insert, update, delete on table public.raid_waves from authenticated;
revoke insert, update, delete on table public.event_registrations from authenticated;
revoke insert, update, delete on table public.event_character_registrations from authenticated;
revoke insert, update, delete on table public.schedule_slots from authenticated;
revoke insert, update, delete on table public.character_weekly_usage from authenticated;
revoke insert, update, delete on table public.schedule_revisions from authenticated;

drop policy if exists raid_events_leader_insert on public.raid_events;
drop policy if exists raid_events_leader_update on public.raid_events;
drop policy if exists raid_waves_leader_insert on public.raid_waves;
drop policy if exists raid_waves_leader_update on public.raid_waves;
drop policy if exists event_registrations_self_write on public.event_registrations;
drop policy if exists event_registrations_leader_manage on public.event_registrations;
drop policy if exists event_character_registrations_self_write on public.event_character_registrations;
drop policy if exists event_character_registrations_leader_manage on public.event_character_registrations;

alter function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb)
  rename to replace_schedule_snapshot_atomic;
alter function public.replace_event_schedule_snapshots(uuid, jsonb, jsonb)
  rename to replace_event_schedule_snapshots_atomic;
alter function public.set_schedule_member_attendance(uuid, uuid, public.registration_state)
  rename to set_schedule_member_attendance_atomic;
alter function public.publish_schedule(uuid, jsonb)
  rename to publish_schedule_atomic;

revoke all on function public.replace_schedule_snapshot_atomic(uuid, uuid, integer, jsonb) from public, authenticated;
revoke all on function public.replace_event_schedule_snapshots_atomic(uuid, jsonb, jsonb) from public, authenticated;
revoke all on function public.set_schedule_member_attendance_atomic(uuid, uuid, public.registration_state) from public, authenticated;
revoke all on function public.publish_schedule_atomic(uuid, jsonb) from public, authenticated;

create function public.replace_schedule_snapshot(
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

create function public.replace_event_schedule_snapshots(
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

  return public.replace_event_schedule_snapshots_atomic(
    p_raid_event_id, p_expected_versions, p_snapshots
  );
end;
$$;

create function public.set_schedule_member_attendance(
  p_raid_event_id uuid,
  p_profile_id uuid,
  p_state public.registration_state
)
returns boolean
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
  if public.current_profile_id() <> p_profile_id
    and not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[])
  then raise exception 'attendance_forbidden'; end if;
  if not exists (
    select 1 from public.group_members membership
    where membership.group_id = event_record.group_id and membership.profile_id = p_profile_id
  ) then raise exception 'attendance_forbidden'; end if;
  if event_record.status in ('completed', 'archived') then raise exception 'schedule_closed'; end if;
  if p_state = 'absent' and exists (
    select 1
    from public.raid_waves wave
    join public.schedule_slots slot on slot.raid_wave_id = wave.id
    where wave.raid_event_id = p_raid_event_id
      and wave.status in ('completed', 'archived')
      and slot.assigned_profile_id = p_profile_id
  ) then raise exception 'schedule_closed'; end if;

  return public.set_schedule_member_attendance_atomic(
    p_raid_event_id, p_profile_id, p_state
  );
end;
$$;

create function public.publish_schedule(
  p_raid_event_id uuid,
  p_expected_versions jsonb
)
returns boolean
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

  return public.publish_schedule_atomic(p_raid_event_id, p_expected_versions);
end;
$$;

revoke all on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) from public;
revoke all on function public.replace_event_schedule_snapshots(uuid, jsonb, jsonb) from public;
revoke all on function public.set_schedule_member_attendance(uuid, uuid, public.registration_state) from public;
revoke all on function public.publish_schedule(uuid, jsonb) from public;
grant execute on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.replace_event_schedule_snapshots(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.set_schedule_member_attendance(uuid, uuid, public.registration_state) to authenticated;
grant execute on function public.publish_schedule(uuid, jsonb) to authenticated;
