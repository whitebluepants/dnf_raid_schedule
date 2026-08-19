insert into public.difficulty_presets (
  group_id,
  code,
  name,
  minimum_fame,
  red_dealer_fame,
  yellow_dealer_fame,
  green_dealer_fame,
  red_buffer_power,
  yellow_buffer_power,
  green_buffer_power,
  simulated_damage_reference,
  auto_assignment_enabled,
  created_by
)
values
  (null, 'normal', '普通', null, null, null, null, null, null, null, null, false, null),
  (null, 'hard', '困难', null, null, null, null, null, null, null, null, false, null),
  (null, 'judgment', '审判', null, null, null, null, null, null, null, null, false, null)
on conflict (code) where group_id is null
do update set
  name = excluded.name,
  minimum_fame = null,
  red_dealer_fame = null,
  yellow_dealer_fame = null,
  green_dealer_fame = null,
  red_buffer_power = null,
  yellow_buffer_power = null,
  green_buffer_power = null,
  simulated_damage_reference = null,
  auto_assignment_enabled = false,
  created_by = null;
