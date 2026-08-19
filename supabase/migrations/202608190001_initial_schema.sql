create extension if not exists pgcrypto;

create type public.member_role as enum ('member', 'leader', 'admin');
create type public.character_role as enum ('dealer', 'buffer');
create type public.strength_tier as enum ('high', 'medium', 'low');
create type public.event_state as enum ('draft', 'open', 'published', 'completed', 'archived');
create type public.registration_state as enum ('participating', 'absent');
create type public.difficulty_code as enum ('normal', 'hard', 'judgment');
create type public.team_color as enum ('red', 'yellow', 'green');
create type public.usage_state as enum ('reserved', 'completed');
create type public.revision_action as enum (
  'generate',
  'move',
  'swap',
  'replace',
  'mark_absent',
  'publish',
  'undo',
  'redo',
  'lock',
  'unlock'
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  invite_code_digest text not null unique check (length(invite_code_digest) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint group_members_group_profile_key unique (group_id, profile_id)
);

create table public.game_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint game_accounts_id_profile_key unique (id, profile_id),
  constraint game_accounts_profile_name_key unique (profile_id, name)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  game_account_id uuid not null,
  profile_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  class_name text not null check (length(btrim(class_name)) between 1 and 80),
  role public.character_role not null,
  fame integer not null constraint characters_fame_positive check (fame > 0),
  strength_tier public.strength_tier not null,
  simulated_damage numeric constraint characters_simulated_damage_positive
    check (simulated_damage is null or simulated_damage > 0),
  buffer_power numeric constraint characters_buffer_power_positive
    check (buffer_power is null or buffer_power > 0),
  notes text,
  is_archived boolean not null default false,
  data_updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint characters_account_owner_fk
    foreign key (game_account_id, profile_id)
    references public.game_accounts(id, profile_id)
    on delete restrict,
  constraint characters_id_profile_key unique (id, profile_id),
  constraint characters_assignment_identity_key unique (id, game_account_id, profile_id),
  constraint characters_account_name_key unique (game_account_id, name)
);

create table public.difficulty_presets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete restrict,
  code public.difficulty_code not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  minimum_fame integer check (minimum_fame is null or minimum_fame > 0),
  red_dealer_fame integer check (red_dealer_fame is null or red_dealer_fame > 0),
  yellow_dealer_fame integer check (yellow_dealer_fame is null or yellow_dealer_fame > 0),
  green_dealer_fame integer check (green_dealer_fame is null or green_dealer_fame > 0),
  red_buffer_power numeric check (red_buffer_power is null or red_buffer_power > 0),
  yellow_buffer_power numeric check (yellow_buffer_power is null or yellow_buffer_power > 0),
  green_buffer_power numeric check (green_buffer_power is null or green_buffer_power > 0),
  simulated_damage_reference numeric
    check (simulated_damage_reference is null or simulated_damage_reference > 0),
  auto_assignment_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint difficulty_presets_group_code_key unique (group_id, code)
);

create unique index difficulty_presets_global_code_key
  on public.difficulty_presets (code)
  where group_id is null;

create table public.raid_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  game_week date not null,
  event_date timestamptz not null,
  status public.event_state not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.raid_waves (
  id uuid primary key default gen_random_uuid(),
  raid_event_id uuid not null references public.raid_events(id) on delete cascade,
  wave_number smallint not null check (wave_number > 0),
  difficulty public.difficulty_code not null,
  status public.event_state not null default 'draft',
  version integer not null default 1 check (version > 0),
  is_locked boolean not null default false,
  red_team_locked boolean not null default false,
  yellow_team_locked boolean not null default false,
  green_team_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint raid_waves_event_number_key unique (raid_event_id, wave_number),
  constraint raid_waves_id_event_key unique (id, raid_event_id)
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  raid_event_id uuid not null references public.raid_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state public.registration_state not null default 'participating',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_registrations_event_profile_key unique (raid_event_id, profile_id)
);

create table public.event_character_registrations (
  id uuid primary key default gen_random_uuid(),
  raid_event_id uuid not null,
  profile_id uuid not null,
  character_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint event_character_registrations_registration_fk
    foreign key (raid_event_id, profile_id)
    references public.event_registrations(raid_event_id, profile_id)
    on delete cascade,
  constraint event_character_registrations_character_owner_fk
    foreign key (character_id, profile_id)
    references public.characters(id, profile_id)
    on delete restrict,
  constraint event_character_registrations_event_character_key
    unique (raid_event_id, character_id)
);

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  raid_wave_id uuid not null references public.raid_waves(id) on delete cascade,
  team_color public.team_color not null,
  slot_index smallint not null check (slot_index between 1 and 4),
  slot_role public.character_role not null,
  assigned_character_id uuid,
  assigned_game_account_id uuid,
  assigned_profile_id uuid,
  is_locked boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint schedule_slots_assignment_all_or_none check (
    (assigned_character_id is null and assigned_game_account_id is null and assigned_profile_id is null)
    or
    (assigned_character_id is not null and assigned_game_account_id is not null and assigned_profile_id is not null)
  ),
  constraint schedule_slots_character_identity_fk
    foreign key (assigned_character_id, assigned_game_account_id, assigned_profile_id)
    references public.characters(id, game_account_id, profile_id)
    on delete restrict,
  constraint schedule_slots_wave_team_slot_key
    unique (raid_wave_id, team_color, slot_index)
);

create table public.character_weekly_usage (
  id uuid primary key default gen_random_uuid(),
  game_week date not null,
  character_id uuid not null references public.characters(id) on delete restrict,
  raid_event_id uuid not null references public.raid_events(id) on delete cascade,
  raid_wave_id uuid not null,
  state public.usage_state not null default 'reserved',
  reserved_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint character_weekly_usage_wave_event_fk
    foreign key (raid_wave_id, raid_event_id)
    references public.raid_waves(id, raid_event_id)
    on delete cascade,
  constraint character_weekly_usage_completion_check check (
    (state = 'reserved' and completed_at is null)
    or (state = 'completed' and completed_at is not null)
  ),
  constraint character_weekly_usage_week_character_key unique (game_week, character_id)
);

create table public.schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  raid_event_id uuid not null references public.raid_events(id) on delete restrict,
  raid_wave_id uuid,
  action public.revision_action not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  expected_version integer check (expected_version is null or expected_version > 0),
  resulting_version integer check (resulting_version is null or resulting_version > 0),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint schedule_revisions_wave_event_fk
    foreign key (raid_wave_id, raid_event_id)
    references public.raid_waves(id, raid_event_id)
    on delete restrict
);

create index group_members_profile_group_idx
  on public.group_members (profile_id, group_id);
create index game_accounts_profile_active_idx
  on public.game_accounts (profile_id, is_archived);
create index characters_profile_active_idx
  on public.characters (profile_id, is_archived, role);
create index raid_events_group_schedule_idx
  on public.raid_events (group_id, event_date desc)
  where status <> 'archived';
create index raid_events_group_week_idx
  on public.raid_events (group_id, game_week);
create index raid_waves_event_order_idx
  on public.raid_waves (raid_event_id, wave_number);
create index event_registrations_event_state_idx
  on public.event_registrations (raid_event_id, state);
create index event_character_registrations_event_profile_idx
  on public.event_character_registrations (raid_event_id, profile_id);
create index schedule_slots_wave_assignment_idx
  on public.schedule_slots (raid_wave_id, assigned_character_id)
  where assigned_character_id is not null;
create unique index schedule_slots_wave_account_key
  on public.schedule_slots (raid_wave_id, assigned_game_account_id)
  where assigned_game_account_id is not null;
create index character_weekly_usage_event_wave_idx
  on public.character_weekly_usage (raid_event_id, raid_wave_id);
create index schedule_revisions_event_created_idx
  on public.schedule_revisions (raid_event_id, created_at desc);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();
create trigger set_group_members_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();
create trigger set_game_accounts_updated_at
before update on public.game_accounts
for each row execute function public.set_updated_at();
create trigger set_characters_updated_at
before update on public.characters
for each row execute function public.set_updated_at();
create trigger set_difficulty_presets_updated_at
before update on public.difficulty_presets
for each row execute function public.set_updated_at();
create trigger set_raid_events_updated_at
before update on public.raid_events
for each row execute function public.set_updated_at();
create trigger set_raid_waves_updated_at
before update on public.raid_waves
for each row execute function public.set_updated_at();
create trigger set_event_registrations_updated_at
before update on public.event_registrations
for each row execute function public.set_updated_at();
create trigger set_schedule_slots_updated_at
before update on public.schedule_slots
for each row execute function public.set_updated_at();

create function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid()
$$;

create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.profile_id = public.current_profile_id()
  )
$$;

create function public.has_group_role(target_group_id uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.profile_id = public.current_profile_id()
      and gm.role = any(roles)
  )
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.has_group_role(uuid, public.member_role[]) from public;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.has_group_role(uuid, public.member_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.game_accounts enable row level security;
alter table public.characters enable row level security;
alter table public.difficulty_presets enable row level security;
alter table public.raid_events enable row level security;
alter table public.raid_waves enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_character_registrations enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.character_weekly_usage enable row level security;
alter table public.schedule_revisions enable row level security;

create policy profiles_select_self_or_peer on public.profiles
for select to authenticated
using (
  id = public.current_profile_id()
  or exists (
    select 1
    from public.group_members self_membership
    join public.group_members peer_membership
      on peer_membership.group_id = self_membership.group_id
    where self_membership.profile_id = public.current_profile_id()
      and peer_membership.profile_id = profiles.id
  )
);
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = public.current_profile_id());
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = public.current_profile_id())
with check (id = public.current_profile_id());

create policy groups_select_members on public.groups
for select to authenticated
using (public.is_group_member(id));
create policy groups_admin_update on public.groups
for update to authenticated
using (public.has_group_role(id, array['admin']::public.member_role[]))
with check (public.has_group_role(id, array['admin']::public.member_role[]));

create policy group_members_select_members on public.group_members
for select to authenticated
using (public.is_group_member(group_id));
create policy group_members_admin_manage on public.group_members
for all to authenticated
using (public.has_group_role(group_id, array['admin']::public.member_role[]))
with check (public.has_group_role(group_id, array['admin']::public.member_role[]));

create policy game_accounts_select_group on public.game_accounts
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or exists (
    select 1 from public.group_members owner_membership
    where owner_membership.profile_id = game_accounts.profile_id
      and public.is_group_member(owner_membership.group_id)
  )
);
create policy game_accounts_owner_insert on public.game_accounts
for insert to authenticated
with check (profile_id = public.current_profile_id());
create policy game_accounts_owner_update on public.game_accounts
for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

create policy characters_select_group on public.characters
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or exists (
    select 1 from public.group_members owner_membership
    where owner_membership.profile_id = characters.profile_id
      and public.is_group_member(owner_membership.group_id)
  )
);
create policy characters_owner_insert on public.characters
for insert to authenticated
with check (profile_id = public.current_profile_id());
create policy characters_owner_update on public.characters
for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

create policy difficulty_presets_select_members on public.difficulty_presets
for select to authenticated
using (
  (group_id is null and exists (
    select 1 from public.group_members gm
    where gm.profile_id = public.current_profile_id()
  ))
  or public.is_group_member(group_id)
);
create policy difficulty_presets_admin_manage on public.difficulty_presets
for all to authenticated
using (
  group_id is not null
  and public.has_group_role(group_id, array['admin']::public.member_role[])
)
with check (
  group_id is not null
  and public.has_group_role(group_id, array['admin']::public.member_role[])
);

create policy raid_events_select_members on public.raid_events
for select to authenticated
using (public.is_group_member(group_id));
create policy raid_events_leader_insert on public.raid_events
for insert to authenticated
with check (
  created_by = public.current_profile_id()
  and public.has_group_role(group_id, array['leader', 'admin']::public.member_role[])
);
create policy raid_events_leader_update on public.raid_events
for update to authenticated
using (
  status <> 'archived'
  and public.has_group_role(group_id, array['leader', 'admin']::public.member_role[])
)
with check (
  public.has_group_role(group_id, array['leader', 'admin']::public.member_role[])
);

create policy raid_waves_select_members on public.raid_waves
for select to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = raid_waves.raid_event_id
      and public.is_group_member(event.group_id)
  )
);
create policy raid_waves_leader_insert on public.raid_waves
for insert to authenticated
with check (
  exists (
    select 1 from public.raid_events event
    where event.id = raid_waves.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
);
create policy raid_waves_leader_update on public.raid_waves
for update to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = raid_waves.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
)
with check (
  exists (
    select 1 from public.raid_events event
    where event.id = raid_waves.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
);

create policy event_registrations_select_self_or_leader on public.event_registrations
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or exists (
    select 1 from public.raid_events event
    where event.id = event_registrations.raid_event_id
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
);
create policy event_registrations_self_write on public.event_registrations
for all to authenticated
using (
  profile_id = public.current_profile_id()
  and exists (
    select 1 from public.raid_events event
    where event.id = event_registrations.raid_event_id
      and event.status <> 'archived'
      and public.is_group_member(event.group_id)
  )
)
with check (
  profile_id = public.current_profile_id()
  and exists (
    select 1 from public.raid_events event
    where event.id = event_registrations.raid_event_id
      and event.status <> 'archived'
      and public.is_group_member(event.group_id)
  )
);
create policy event_registrations_leader_manage on public.event_registrations
for all to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = event_registrations.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
)
with check (
  exists (
    select 1 from public.raid_events event
    where event.id = event_registrations.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
      and exists (
        select 1 from public.group_members target_member
        where target_member.group_id = event.group_id
          and target_member.profile_id = event_registrations.profile_id
      )
  )
);

create policy event_character_registrations_select_self_or_leader on public.event_character_registrations
for select to authenticated
using (
  profile_id = public.current_profile_id()
  or exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
);
create policy event_character_registrations_self_write on public.event_character_registrations
for all to authenticated
using (
  profile_id = public.current_profile_id()
  and exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and event.status <> 'archived'
      and public.is_group_member(event.group_id)
  )
)
with check (
  profile_id = public.current_profile_id()
  and exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and event.status <> 'archived'
      and public.is_group_member(event.group_id)
  )
);
create policy event_character_registrations_leader_manage on public.event_character_registrations
for all to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
)
with check (
  exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
      and exists (
        select 1 from public.group_members target_member
        where target_member.group_id = event.group_id
          and target_member.profile_id = event_character_registrations.profile_id
      )
  )
);

create policy schedule_slots_select_members on public.schedule_slots
for select to authenticated
using (
  exists (
    select 1
    from public.raid_waves wave
    join public.raid_events event on event.id = wave.raid_event_id
    where wave.id = schedule_slots.raid_wave_id
      and public.is_group_member(event.group_id)
  )
);
create policy character_weekly_usage_select_members on public.character_weekly_usage
for select to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = character_weekly_usage.raid_event_id
      and public.is_group_member(event.group_id)
  )
);

create policy schedule_revisions_select_members on public.schedule_revisions
for select to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = schedule_revisions.raid_event_id
      and public.is_group_member(event.group_id)
  )
);
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
