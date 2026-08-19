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
  event_record public.raid_events%rowtype;
  affected_wave record;
  before_slots jsonb;
  selected_ids uuid[] := case when p_state = 'participating' then coalesce(p_character_ids, array[]::uuid[]) else array[]::uuid[] end;
begin
  select event.* into event_record
  from public.raid_events event
  where event.id = p_raid_event_id
  for update;
  if not found
    or owner_id is null
    or not exists (
      select 1 from public.group_members membership
      where membership.group_id = event_record.group_id and membership.profile_id = owner_id
  )
  then raise exception 'registration_forbidden'; end if;
  if event_record.status in ('completed', 'archived')
  then raise exception 'registration_closed'; end if;

  if coalesce(array_length(selected_ids, 1), 0) <> coalesce((select count(distinct id) from unnest(selected_ids) id), 0)
  then raise exception 'character_forbidden'; end if;
  if exists (
    select 1 from unnest(selected_ids) character_id
    where not exists (
      select 1
      from public.characters character
      join public.game_accounts account
        on account.id = character.game_account_id
       and account.profile_id = character.profile_id
      where character.id = character_id
        and character.profile_id = owner_id
        and character.group_id = event_record.group_id
        and account.group_id = event_record.group_id
        and not character.is_archived
        and not account.is_archived
    )
  ) then raise exception 'character_forbidden'; end if;

  if exists (
    select 1
    from public.raid_waves wave
    join public.schedule_slots slot on slot.raid_wave_id = wave.id
    where wave.raid_event_id = p_raid_event_id
      and wave.status in ('completed', 'archived')
      and slot.assigned_profile_id = owner_id
      and not (slot.assigned_character_id = any(selected_ids))
  ) then raise exception 'registration_closed'; end if;

  for affected_wave in
    select wave.id, wave.version
    from public.raid_waves wave
    where wave.raid_event_id = p_raid_event_id
      and wave.status in ('draft', 'open', 'published')
      and exists (
        select 1 from public.schedule_slots slot
        where slot.raid_wave_id = wave.id
          and slot.assigned_profile_id = owner_id
          and not (slot.assigned_character_id = any(selected_ids))
      )
    order by wave.wave_number
    for update of wave
  loop
    select coalesce(jsonb_agg(to_jsonb(slot)), '[]'::jsonb) into before_slots
    from public.schedule_slots slot where slot.raid_wave_id = affected_wave.id;

    delete from public.character_weekly_usage usage
    using public.schedule_slots slot
    where slot.raid_wave_id = affected_wave.id
      and slot.assigned_profile_id = owner_id
      and not (slot.assigned_character_id = any(selected_ids))
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
    where raid_wave_id = affected_wave.id
      and assigned_profile_id = owner_id
      and not (assigned_character_id = any(selected_ids));

    update public.raid_waves
    set version = affected_wave.version + 1,
        status = 'draft',
        updated_at = timezone('utc', now())
    where id = affected_wave.id;

    insert into public.schedule_revisions (
      raid_event_id, raid_wave_id, action, actor_profile_id,
      expected_version, resulting_version, before_state, after_state
    ) values (
      p_raid_event_id, affected_wave.id, 'replace', owner_id,
      affected_wave.version, affected_wave.version + 1, before_slots,
      jsonb_build_object('registration_profile_id', owner_id, 'selected_character_ids', to_jsonb(selected_ids))
    );
  end loop;

  if exists (
    select 1 from public.raid_waves wave
    where wave.raid_event_id = p_raid_event_id and wave.status = 'draft'
  ) then
    update public.raid_events
    set status = 'draft', updated_at = timezone('utc', now())
    where id = p_raid_event_id and status = 'published';
  end if;

  insert into public.event_registrations (raid_event_id, profile_id, state)
  values (p_raid_event_id, owner_id, p_state)
  on conflict (raid_event_id, profile_id)
  do update set state = excluded.state, version = event_registrations.version + 1;

  delete from public.event_character_registrations
  where raid_event_id = p_raid_event_id and profile_id = owner_id;
  if p_state = 'participating' and coalesce(array_length(selected_ids, 1), 0) > 0 then
    insert into public.event_character_registrations (raid_event_id, profile_id, character_id)
    select p_raid_event_id, owner_id, character_id from unnest(selected_ids) character_id;
  end if;
  return true;
end;
$$;

revoke all on function public.replace_event_registration(uuid, public.registration_state, uuid[]) from public;
grant execute on function public.replace_event_registration(uuid, public.registration_state, uuid[]) to authenticated;
