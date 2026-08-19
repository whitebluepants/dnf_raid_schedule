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
  event_group_id uuid;
  event_week date;
  next_version integer;
  snapshot_row jsonb;
begin
  select wave
    into wave_record
  from public.raid_waves wave
  join public.raid_events event on event.id = wave.raid_event_id
  where wave.id = p_raid_wave_id
    and wave.raid_event_id = p_raid_event_id
  for update;

  if not found then
    raise exception 'wave_not_found';
  end if;
  select event.group_id, event.game_week
    into event_group_id, event_week
  from public.raid_events event
  where event.id = p_raid_event_id;
  if not public.has_group_role(event_group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'schedule_forbidden';
  end if;
  if wave_record.status = 'archived' then
    raise exception 'event_archived';
  end if;
  if exists (
    select 1 from public.raid_events event
    where event.id = p_raid_event_id and event.status = 'archived'
  ) then
    raise exception 'event_archived';
  end if;
  if wave_record.version <> p_expected_version then
    raise exception 'schedule_version_conflict';
  end if;
  if jsonb_typeof(p_snapshot) <> 'array' then
    raise exception 'invalid_snapshot';
  end if;

  for snapshot_row in select value from jsonb_array_elements(p_snapshot)
  loop
    if (snapshot_row ->> 'team_color') not in ('red', 'yellow', 'green')
      or (snapshot_row ->> 'slot_role') not in ('dealer', 'buffer')
      or (snapshot_row ->> 'slot_index')::integer not between 1 and 4 then
      raise exception 'invalid_slot';
    end if;
    if (snapshot_row ->> 'character_id') is null
      and ((snapshot_row ->> 'game_account_id') is not null or (snapshot_row ->> 'profile_id') is not null) then
      raise exception 'invalid_assignment_identity';
    end if;
    if (snapshot_row ->> 'character_id') is not null
      and ((snapshot_row ->> 'game_account_id') is null or (snapshot_row ->> 'profile_id') is null) then
      raise exception 'invalid_assignment_identity';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
    where row.character_id is not null
    group by row.character_id having count(*) > 1
  ) then
    raise exception 'duplicate_character';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_snapshot) as row(game_account_id uuid)
    where row.game_account_id is not null
    group by row.game_account_id having count(*) > 1
  ) then
    raise exception 'duplicate_account';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as row(character_id uuid, profile_id uuid)
    where row.character_id is not null
      and not exists (
        select 1 from public.event_character_registrations registration
        join public.event_registrations event_registration
          on event_registration.raid_event_id = registration.raid_event_id
         and event_registration.profile_id = registration.profile_id
        where registration.raid_event_id = p_raid_event_id
          and registration.character_id = row.character_id
          and registration.profile_id = row.profile_id
          and event_registration.state = 'participating'
      )
  ) then
    raise exception 'character_not_registered';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
    join public.character_weekly_usage usage on usage.character_id = row.character_id
      and usage.game_week = event_week
      and usage.raid_wave_id <> p_raid_wave_id
    where row.character_id is not null
  ) then
    raise exception 'character_weekly_conflict';
  end if;

  delete from public.character_weekly_usage
  where raid_wave_id = p_raid_wave_id and state = 'reserved';

  delete from public.schedule_slots
  where raid_wave_id = p_raid_wave_id;

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
    wave_record.version + 1
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
  select event_week, row.character_id, p_raid_event_id, p_raid_wave_id, public.current_profile_id()
  from jsonb_to_recordset(p_snapshot) as row(character_id uuid)
  where row.character_id is not null;

  next_version := wave_record.version + 1;
  update public.raid_waves
    set version = next_version,
        updated_at = timezone('utc', now())
  where id = p_raid_wave_id;

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

revoke all on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) from public;
grant execute on function public.replace_schedule_snapshot(uuid, uuid, integer, jsonb) to authenticated;

create or replace function public.create_group(
  p_name text,
  p_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_group_id uuid;
  owner_id uuid := public.current_profile_id();
begin
  if owner_id is null or length(btrim(p_name)) not between 1 and 120 or length(btrim(p_invite_code)) not between 6 and 64 then
    raise exception 'invalid_group_input';
  end if;
  insert into public.groups (name, invite_code_digest, created_by)
  values (btrim(p_name), encode(digest(upper(btrim(p_invite_code)), 'sha256'), 'hex'), owner_id)
  returning id into new_group_id;
  insert into public.group_members (group_id, profile_id, role)
  values (new_group_id, owner_id, 'admin');
  return new_group_id;
exception when unique_violation then
  raise exception 'invite_code_in_use';
end;
$$;

create or replace function public.join_group_by_invite(
  p_invite_code text,
  p_nickname text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := public.current_profile_id();
  matched_group_id uuid;
begin
  if owner_id is null or length(btrim(p_nickname)) not between 1 and 80 or length(btrim(p_invite_code)) not between 6 and 64 then
    raise exception 'invalid_onboarding_input';
  end if;
  insert into public.profiles (id, display_name)
  values (owner_id, btrim(p_nickname))
  on conflict (id) do update set display_name = excluded.display_name;
  select id into matched_group_id
  from public.groups
  where invite_code_digest = encode(digest(upper(btrim(p_invite_code)), 'sha256'), 'hex');
  if matched_group_id is null then
    raise exception 'invite_not_found';
  end if;
  insert into public.group_members (group_id, profile_id, role)
  values (matched_group_id, owner_id, 'member')
  on conflict (group_id, profile_id) do nothing;
  return matched_group_id;
end;
$$;

revoke all on function public.create_group(text, text) from public;
revoke all on function public.join_group_by_invite(text, text) from public;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group_by_invite(text, text) to authenticated;

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
  select group_id into event_group_id from public.raid_events where id = p_raid_event_id and status <> 'archived';
  if event_group_id is null or not public.is_group_member(event_group_id) then raise exception 'registration_forbidden'; end if;
  insert into public.event_registrations (raid_event_id, profile_id, state)
  values (p_raid_event_id, owner_id, p_state)
  on conflict (raid_event_id, profile_id) do update set state = excluded.state;
  delete from public.event_character_registrations
  where raid_event_id = p_raid_event_id and profile_id = owner_id;
  if p_state = 'participating' and coalesce(array_length(p_character_ids, 1), 0) > 0 then
    if exists (
      select 1 from unnest(p_character_ids) character_id
      where not exists (
        select 1 from public.characters character
        where character.id = character_id and character.profile_id = owner_id and not character.is_archived
      )
    ) then raise exception 'character_forbidden'; end if;
    insert into public.event_character_registrations (raid_event_id, profile_id, character_id)
    select p_raid_event_id, owner_id, character_id from unnest(p_character_ids) character_id;
  end if;
  return true;
end;
$$;

revoke all on function public.replace_event_registration(uuid, public.registration_state, uuid[]) from public;
grant execute on function public.replace_event_registration(uuid, public.registration_state, uuid[]) to authenticated;
