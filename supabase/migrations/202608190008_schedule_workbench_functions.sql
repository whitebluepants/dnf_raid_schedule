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
  wave_record public.raid_waves%rowtype;
  event_record public.raid_events%rowtype;
  next_version integer;
  snapshot_row jsonb;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;

  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'schedule_forbidden';
  end if;
  if event_record.status = 'archived' then raise exception 'event_archived'; end if;

  select wave.* into wave_record
  from public.raid_waves wave
  where wave.id = p_raid_wave_id
    and wave.raid_event_id = p_raid_event_id
  for update;

  if not found then raise exception 'wave_not_found'; end if;
  if wave_record.status = 'archived' then raise exception 'event_archived'; end if;
  if wave_record.version <> p_expected_version then raise exception 'schedule_version_conflict'; end if;
  if jsonb_typeof(p_snapshot) <> 'array' or jsonb_array_length(p_snapshot) <> 12 then
    raise exception 'invalid_snapshot';
  end if;

  for snapshot_row in select value from jsonb_array_elements(p_snapshot)
  loop
    if (snapshot_row ->> 'team_color') not in ('red', 'yellow', 'green')
      or (snapshot_row ->> 'slot_role') not in ('dealer', 'buffer')
      or (snapshot_row ->> 'slot_index')::integer not between 1 and 4
      or ((snapshot_row ->> 'slot_index')::integer = 1 and (snapshot_row ->> 'slot_role') <> 'buffer')
      or ((snapshot_row ->> 'slot_index')::integer > 1 and (snapshot_row ->> 'slot_role') <> 'dealer')
    then raise exception 'invalid_slot'; end if;

    if (snapshot_row ->> 'character_id') is null
      and ((snapshot_row ->> 'game_account_id') is not null or (snapshot_row ->> 'profile_id') is not null)
    then raise exception 'invalid_assignment_identity'; end if;
    if (snapshot_row ->> 'character_id') is not null
      and ((snapshot_row ->> 'game_account_id') is null or (snapshot_row ->> 'profile_id') is null)
    then raise exception 'invalid_assignment_identity'; end if;
  end loop;

  if exists (
    select 1 from jsonb_to_recordset(p_snapshot) as row(team_color text, slot_index integer)
    group by row.team_color, row.slot_index having count(*) > 1
  ) then raise exception 'duplicate_slot'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
    where row.character_id is not null group by row.character_id having count(*) > 1
  ) then raise exception 'duplicate_character'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_snapshot) as row(game_account_id uuid)
    where row.game_account_id is not null group by row.game_account_id having count(*) > 1
  ) then raise exception 'duplicate_account'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as row(character_id uuid, game_account_id uuid, profile_id uuid)
    where row.character_id is not null
      and not exists (
        select 1
        from public.characters character
        join public.game_accounts account
          on account.id = character.game_account_id
         and account.profile_id = character.profile_id
        join public.event_character_registrations registration
          on registration.raid_event_id = p_raid_event_id
         and registration.character_id = character.id
         and registration.profile_id = character.profile_id
        join public.event_registrations attendance
          on attendance.raid_event_id = registration.raid_event_id
         and attendance.profile_id = registration.profile_id
        where character.id = row.character_id
          and character.game_account_id = row.game_account_id
          and character.profile_id = row.profile_id
          and character.group_id = event_record.group_id
          and account.group_id = event_record.group_id
          and not character.is_archived
          and not account.is_archived
          and attendance.state = 'participating'
      )
  ) then raise exception 'character_not_registered'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
    join public.character_weekly_usage usage
      on usage.character_id = row.character_id
     and usage.game_week = event_record.game_week
     and usage.raid_wave_id <> p_raid_wave_id
    where row.character_id is not null
  ) then raise exception 'character_weekly_conflict'; end if;

  delete from public.character_weekly_usage
  where raid_wave_id = p_raid_wave_id and state = 'reserved';
  delete from public.schedule_slots where raid_wave_id = p_raid_wave_id;

  next_version := wave_record.version + 1;
  insert into public.schedule_slots (
    raid_wave_id, team_color, slot_index, slot_role,
    assigned_character_id, assigned_game_account_id, assigned_profile_id,
    is_locked, version
  )
  select
    p_raid_wave_id,
    row.team_color::public.team_color,
    row.slot_index,
    row.slot_role::public.character_role,
    row.character_id,
    row.game_account_id,
    row.profile_id,
    coalesce(row.is_locked, false),
    next_version
  from jsonb_to_recordset(p_snapshot) as row(
    team_color text,
    slot_index smallint,
    slot_role text,
    character_id uuid,
    game_account_id uuid,
    profile_id uuid,
    is_locked boolean
  );

  insert into public.character_weekly_usage (
    game_week, character_id, raid_event_id, raid_wave_id, reserved_by
  )
  select event_record.game_week, row.character_id, p_raid_event_id, p_raid_wave_id, public.current_profile_id()
  from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
  where row.character_id is not null;

  update public.raid_waves
  set version = next_version, status = 'draft', updated_at = timezone('utc', now())
  where id = p_raid_wave_id;
  update public.raid_events
  set status = 'draft', updated_at = timezone('utc', now())
  where id = p_raid_event_id and status = 'published';

  insert into public.schedule_revisions (
    raid_event_id, raid_wave_id, action, actor_profile_id,
    expected_version, resulting_version, before_state, after_state
  ) values (
    p_raid_event_id, p_raid_wave_id, 'replace', public.current_profile_id(),
    p_expected_version, next_version, '{}'::jsonb, p_snapshot
  );
  return next_version;
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
  wave_record public.raid_waves%rowtype;
  resulting_versions jsonb := '{}'::jsonb;
  next_version integer;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'schedule_forbidden';
  end if;
  if event_record.status = 'archived' then raise exception 'event_archived'; end if;
  if jsonb_typeof(p_expected_versions) <> 'object' or jsonb_typeof(p_snapshots) <> 'object'
  then raise exception 'invalid_snapshot'; end if;

  for wave_record in
    select * from public.raid_waves
    where raid_event_id = p_raid_event_id and status <> 'archived'
    order by wave_number
    for update
  loop
    if not (p_expected_versions ? wave_record.id::text)
      or not (p_snapshots ? wave_record.id::text)
      or (p_expected_versions ->> wave_record.id::text)::integer <> wave_record.version
    then raise exception 'schedule_version_conflict'; end if;
  end loop;
  if (select count(*) from public.raid_waves where raid_event_id = p_raid_event_id and status <> 'archived')
    <> (select count(*) from jsonb_object_keys(p_snapshots))
  then raise exception 'invalid_snapshot'; end if;

  delete from public.character_weekly_usage usage
  using public.raid_waves wave
  where wave.raid_event_id = p_raid_event_id
    and usage.raid_wave_id = wave.id
    and usage.state = 'reserved';
  delete from public.schedule_slots slot
  using public.raid_waves wave
  where wave.raid_event_id = p_raid_event_id and slot.raid_wave_id = wave.id;

  for wave_record in
    select * from public.raid_waves
    where raid_event_id = p_raid_event_id and status <> 'archived'
    order by wave_number
  loop
    next_version := public.replace_schedule_snapshot(
      p_raid_event_id,
      wave_record.id,
      wave_record.version,
      p_snapshots -> wave_record.id::text
    );
    resulting_versions := resulting_versions || jsonb_build_object(wave_record.id::text, next_version);
  end loop;
  return resulting_versions;
end;
$$;

create or replace function public.set_schedule_member_attendance(
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
  affected_wave record;
  before_slots jsonb;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found or event_record.status = 'archived' then raise exception 'event_not_found'; end if;
  if public.current_profile_id() <> p_profile_id
    and not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[])
  then raise exception 'attendance_forbidden'; end if;
  if not exists (
    select 1 from public.group_members membership
    where membership.group_id = event_record.group_id and membership.profile_id = p_profile_id
  ) then raise exception 'attendance_forbidden'; end if;

  insert into public.event_registrations (raid_event_id, profile_id, state)
  values (p_raid_event_id, p_profile_id, p_state)
  on conflict (raid_event_id, profile_id)
  do update set state = excluded.state, version = event_registrations.version + 1;

  if p_state = 'absent' then
    for affected_wave in
      select wave.id, wave.version
      from public.raid_waves wave
      where wave.raid_event_id = p_raid_event_id
        and exists (
          select 1 from public.schedule_slots slot
          where slot.raid_wave_id = wave.id and slot.assigned_profile_id = p_profile_id
        )
      for update of wave
    loop
      select coalesce(jsonb_agg(to_jsonb(slot)), '[]'::jsonb) into before_slots
      from public.schedule_slots slot where slot.raid_wave_id = affected_wave.id;

      delete from public.character_weekly_usage usage
      using public.schedule_slots slot
      where slot.raid_wave_id = affected_wave.id
        and slot.assigned_profile_id = p_profile_id
        and usage.raid_wave_id = affected_wave.id
        and usage.character_id = slot.assigned_character_id
        and usage.state = 'reserved';

      update public.schedule_slots
      set assigned_character_id = null,
          assigned_game_account_id = null,
          assigned_profile_id = null,
          is_locked = false,
          version = affected_wave.version + 1,
          updated_at = timezone('utc', now())
      where raid_wave_id = affected_wave.id and assigned_profile_id = p_profile_id;
      update public.raid_waves
      set version = affected_wave.version + 1, status = 'draft', updated_at = timezone('utc', now())
      where id = affected_wave.id;
      insert into public.schedule_revisions (
        raid_event_id, raid_wave_id, action, actor_profile_id,
        expected_version, resulting_version, before_state, after_state
      ) values (
        p_raid_event_id, affected_wave.id, 'mark_absent', public.current_profile_id(),
        affected_wave.version, affected_wave.version + 1, before_slots,
        jsonb_build_object('absent_profile_id', p_profile_id)
      );
    end loop;
    update public.raid_events set status = 'draft', updated_at = timezone('utc', now())
    where id = p_raid_event_id and status = 'published';
  end if;
  return true;
end;
$$;

create or replace function public.publish_schedule(
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
  wave_record public.raid_waves%rowtype;
  published_versions jsonb;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'schedule_forbidden';
  end if;
  if event_record.status = 'archived' then raise exception 'event_archived'; end if;
  if jsonb_typeof(p_expected_versions) <> 'object' then raise exception 'invalid_versions'; end if;

  for wave_record in
    select * from public.raid_waves
    where raid_event_id = p_raid_event_id and status <> 'archived'
    order by wave_number
    for update
  loop
    if not (p_expected_versions ? wave_record.id::text)
      or (p_expected_versions ->> wave_record.id::text)::integer <> wave_record.version
    then raise exception 'schedule_version_conflict'; end if;
    if (select count(*) from public.schedule_slots slot where slot.raid_wave_id = wave_record.id) <> 12
      or exists (
        select 1 from public.schedule_slots slot
        where slot.raid_wave_id = wave_record.id and slot.assigned_character_id is null
      )
    then raise exception 'schedule_incomplete'; end if;
    if exists (
      select 1
      from public.schedule_slots slot
      join public.characters character on character.id = slot.assigned_character_id
      where slot.raid_wave_id = wave_record.id
        and character.role <> slot.slot_role
    ) then raise exception 'schedule_role_mismatch'; end if;
    if exists (
      select 1
      from public.schedule_slots slot
      left join public.characters character
        on character.id = slot.assigned_character_id
       and character.game_account_id = slot.assigned_game_account_id
       and character.profile_id = slot.assigned_profile_id
      left join public.game_accounts account
        on account.id = slot.assigned_game_account_id
       and account.profile_id = slot.assigned_profile_id
      left join public.event_character_registrations registration
        on registration.raid_event_id = p_raid_event_id
       and registration.character_id = slot.assigned_character_id
       and registration.profile_id = slot.assigned_profile_id
      left join public.event_registrations attendance
        on attendance.raid_event_id = registration.raid_event_id
       and attendance.profile_id = registration.profile_id
      where slot.raid_wave_id = wave_record.id
        and (
          character.id is null
          or character.group_id <> event_record.group_id
          or character.is_archived
          or account.id is null
          or account.group_id <> event_record.group_id
          or account.is_archived
          or registration.id is null
          or attendance.state is distinct from 'participating'
        )
    ) then raise exception 'schedule_registration_invalid'; end if;
  end loop;

  if not exists (select 1 from public.raid_waves where raid_event_id = p_raid_event_id and status <> 'archived')
  then raise exception 'schedule_incomplete'; end if;

  update public.raid_waves set status = 'published', version = version + 1, updated_at = timezone('utc', now())
  where raid_event_id = p_raid_event_id and status <> 'archived';
  update public.schedule_slots slot
  set version = wave.version, updated_at = timezone('utc', now())
  from public.raid_waves wave
  where wave.raid_event_id = p_raid_event_id and slot.raid_wave_id = wave.id;
  select coalesce(jsonb_object_agg(wave.id::text, wave.version), '{}'::jsonb)
  into published_versions
  from public.raid_waves wave
  where wave.raid_event_id = p_raid_event_id and wave.status = 'published';
  update public.raid_events set status = 'published', updated_at = timezone('utc', now())
  where id = p_raid_event_id;
  insert into public.schedule_revisions (
    raid_event_id, raid_wave_id, action, actor_profile_id, before_state, after_state
  ) values (
    p_raid_event_id, null, 'publish', public.current_profile_id(),
    jsonb_build_object('status', event_record.status),
    jsonb_build_object('status', 'published', 'versions', published_versions)
  );
  return true;
end;
$$;

create or replace function public.replace_event_registration(
  p_raid_event_id uuid,
  p_state public.registration_state,
  p_character_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := public.current_profile_id();
  event_group_id uuid;
begin
  select group_id into event_group_id
  from public.raid_events
  where id = p_raid_event_id and status <> 'archived';
  if event_group_id is null or not public.is_group_member(event_group_id) then
    raise exception 'registration_forbidden';
  end if;

  if p_state = 'absent' then
    perform public.set_schedule_member_attendance(p_raid_event_id, owner_id, 'absent');
    delete from public.event_character_registrations
    where raid_event_id = p_raid_event_id and profile_id = owner_id;
    return true;
  end if;

  if exists (
    select 1 from unnest(p_character_ids) character_id
    where not exists (
      select 1 from public.characters character
      join public.game_accounts account on account.id = character.game_account_id
      where character.id = character_id
        and character.profile_id = owner_id
        and character.group_id = event_group_id
        and not character.is_archived
        and account.group_id = event_group_id
        and not account.is_archived
    )
  ) then raise exception 'character_forbidden'; end if;

  insert into public.event_registrations (raid_event_id, profile_id, state)
  values (p_raid_event_id, owner_id, 'participating')
  on conflict (raid_event_id, profile_id)
  do update set state = excluded.state, version = event_registrations.version + 1;
  delete from public.event_character_registrations
  where raid_event_id = p_raid_event_id and profile_id = owner_id;
  insert into public.event_character_registrations (raid_event_id, profile_id, character_id)
  select p_raid_event_id, owner_id, character_id from unnest(p_character_ids) character_id;
  return true;
end;
$$;

revoke all on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) from public;
revoke all on function public.replace_event_schedule_snapshots(uuid, jsonb, jsonb) from public;
revoke all on function public.set_schedule_member_attendance(uuid, uuid, public.registration_state) from public;
revoke all on function public.publish_schedule(uuid, jsonb) from public;
revoke all on function public.replace_event_registration(uuid, public.registration_state, uuid[]) from public;
grant execute on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.replace_event_schedule_snapshots(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.set_schedule_member_attendance(uuid, uuid, public.registration_state) to authenticated;
grant execute on function public.publish_schedule(uuid, jsonb) to authenticated;
grant execute on function public.replace_event_registration(uuid, public.registration_state, uuid[]) to authenticated;
