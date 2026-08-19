create or replace function public.create_raid_event_with_waves(
  p_group_id uuid,
  p_title text,
  p_event_date timestamptz,
  p_game_week date,
  p_waves jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  event_id uuid;
  wave_count integer;
begin
  if actor_id is null
    or length(btrim(p_title)) not between 1 and 160
    or p_event_date is null
    or p_game_week is null
    or p_waves is null
    or jsonb_typeof(p_waves) <> 'array'
  then
    raise exception 'invalid_activity_input';
  end if;

  if not public.has_group_role(p_group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'activity_forbidden';
  end if;

  wave_count := jsonb_array_length(p_waves);
  if wave_count < 1
    or exists (
      select 1
      from jsonb_array_elements(p_waves) wave
      where jsonb_typeof(wave) <> 'object'
        or coalesce(wave->>'difficulty', '') not in ('normal', 'hard', 'judgment')
        or coalesce(wave->>'order', '') !~ '^[1-9][0-9]*$'
    )
    or (select count(distinct (wave->>'order')::integer) from jsonb_array_elements(p_waves) wave) <> wave_count
    or (select min((wave->>'order')::integer) from jsonb_array_elements(p_waves) wave) <> 1
    or (select max((wave->>'order')::integer) from jsonb_array_elements(p_waves) wave) <> wave_count
  then
    raise exception 'invalid_activity_waves';
  end if;

  insert into public.raid_events (group_id, title, event_date, game_week, created_by)
  values (p_group_id, btrim(p_title), p_event_date, p_game_week, actor_id)
  returning id into event_id;

  insert into public.raid_waves (raid_event_id, wave_number, difficulty)
  select event_id, (wave->>'order')::smallint, (wave->>'difficulty')::public.difficulty_code
  from jsonb_array_elements(p_waves) wave
  order by (wave->>'order')::integer;

  return event_id;
end;
$$;

revoke all on function public.create_raid_event_with_waves(uuid, text, timestamptz, date, jsonb) from public;
grant execute on function public.create_raid_event_with_waves(uuid, text, timestamptz, date, jsonb) to authenticated;
