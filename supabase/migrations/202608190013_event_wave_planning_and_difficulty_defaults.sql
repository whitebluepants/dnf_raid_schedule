-- Activities start as a tentative plan. Managers may change the number and
-- difficulty of waves until any slot has been scheduled; registrations stay on
-- the event and therefore do not need to be recreated.
create or replace function public.sync_raid_event_waves(
  p_raid_event_id uuid,
  p_waves jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_record public.raid_events%rowtype;
  wave_count integer;
begin
  if auth.uid() is null
    or p_waves is null
    or jsonb_typeof(p_waves) <> 'array'
  then
    raise exception 'invalid_activity_waves';
  end if;

  select * into event_record
  from public.raid_events
  where id = p_raid_event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if not public.has_group_role(event_record.group_id, array['leader', 'admin']::public.member_role[]) then
    raise exception 'activity_forbidden';
  end if;
  if event_record.status not in ('draft', 'open') then raise exception 'event_plan_locked'; end if;

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

  if exists (
    select 1
    from public.schedule_slots slot
    join public.raid_waves wave on wave.id = slot.raid_wave_id
    where wave.raid_event_id = p_raid_event_id
  ) then
    raise exception 'wave_plan_locked';
  end if;

  delete from public.raid_waves where raid_event_id = p_raid_event_id;
  insert into public.raid_waves (raid_event_id, wave_number, difficulty, status)
  select p_raid_event_id, (wave->>'order')::smallint, (wave->>'difficulty')::public.difficulty_code, event_record.status
  from jsonb_array_elements(p_waves) wave
  order by (wave->>'order')::integer;
  return true;
end;
$$;

revoke all on function public.sync_raid_event_waves(uuid, jsonb) from public;
grant execute on function public.sync_raid_event_waves(uuid, jsonb) to authenticated;

drop policy if exists difficulty_presets_select_members on public.difficulty_presets;
create policy difficulty_presets_select_members on public.difficulty_presets
for select to authenticated
using (
  public.is_platform_admin()
  or (group_id is null and exists (
    select 1 from public.group_members membership where membership.profile_id = auth.uid()
  ))
  or public.is_group_member(group_id)
);

drop policy if exists difficulty_presets_admin_manage on public.difficulty_presets;
create policy difficulty_presets_admin_manage on public.difficulty_presets
for all to authenticated
using (group_id is not null and public.has_group_role(group_id, array['leader', 'admin']::public.member_role[]))
with check (group_id is not null and public.has_group_role(group_id, array['leader', 'admin']::public.member_role[]));

-- Baseline definitions make the configuration screen useful immediately. The
-- references intentionally start blank: each Chinese-server group owns its
-- own thresholds and saving creates its isolated override.
insert into public.difficulty_presets (group_id, code, name, created_by)
select null, seed.code::public.difficulty_code, seed.name, null
from (values
  ('normal', '普通'),
  ('hard', '困难'),
  ('judgment', '审判')
) as seed(code, name)
where not exists (
  select 1 from public.difficulty_presets existing
  where existing.group_id is null and existing.code = seed.code::public.difficulty_code
);
