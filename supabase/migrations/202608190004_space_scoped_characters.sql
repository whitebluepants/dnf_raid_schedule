-- Accounts and characters belong to one team space. A profile may join several
-- spaces, but records created for one space must never become visible in another.
alter table public.game_accounts
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

alter table public.characters
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

-- Backfill the unambiguous legacy case without guessing for members that belong
-- to more than one space. Ambiguous legacy records remain inaccessible until an
-- administrator assigns them deliberately.
update public.game_accounts account
set group_id = membership.group_id
from public.group_members membership
where membership.profile_id = account.profile_id
  and account.group_id is null
  and not exists (
    select 1
    from public.group_members another_membership
    where another_membership.profile_id = account.profile_id
      and another_membership.group_id <> membership.group_id
  );

update public.characters character
set group_id = account.group_id
from public.game_accounts account
where account.id = character.game_account_id
  and account.profile_id = character.profile_id
  and character.group_id is null;

alter table public.game_accounts
  drop constraint if exists game_accounts_id_profile_group_key;

alter table public.game_accounts
  add constraint game_accounts_id_profile_group_key
  unique (id, profile_id, group_id);

alter table public.game_accounts
  drop constraint if exists game_accounts_profile_name_key;

alter table public.game_accounts
  add constraint game_accounts_profile_group_name_key
  unique (profile_id, group_id, name);

alter table public.characters
  drop constraint if exists characters_account_owner_fk;

alter table public.characters
  add constraint characters_account_owner_group_fk
  foreign key (game_account_id, profile_id, group_id)
  references public.game_accounts(id, profile_id, group_id)
  on delete restrict;

drop policy if exists game_accounts_select_group on public.game_accounts;
drop policy if exists game_accounts_owner_insert on public.game_accounts;
drop policy if exists game_accounts_owner_update on public.game_accounts;
create policy game_accounts_select_group on public.game_accounts
for select to authenticated
using (
  (group_id is not null and public.is_group_member(group_id))
  or (group_id is null and profile_id = public.current_profile_id())
);
create policy game_accounts_owner_insert on public.game_accounts
for insert to authenticated
with check (profile_id = public.current_profile_id() and public.is_group_member(group_id));
create policy game_accounts_owner_update on public.game_accounts
for update to authenticated
using (
  profile_id = public.current_profile_id()
  and (group_id is null or public.is_group_member(group_id))
)
with check (profile_id = public.current_profile_id() and public.is_group_member(group_id));

drop policy if exists characters_select_group on public.characters;
drop policy if exists characters_owner_insert on public.characters;
drop policy if exists characters_owner_update on public.characters;
create policy characters_select_group on public.characters
for select to authenticated
using (
  (group_id is not null and public.is_group_member(group_id))
  or (group_id is null and profile_id = public.current_profile_id())
);
create policy characters_owner_insert on public.characters
for insert to authenticated
with check (profile_id = public.current_profile_id() and public.is_group_member(group_id));
create policy characters_owner_update on public.characters
for update to authenticated
using (
  profile_id = public.current_profile_id()
  and (group_id is null or public.is_group_member(group_id))
)
with check (profile_id = public.current_profile_id() and public.is_group_member(group_id));

drop policy if exists event_character_registrations_self_write on public.event_character_registrations;
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
  and exists (
    select 1
    from public.characters character
    join public.raid_events event on event.id = event_character_registrations.raid_event_id
    where character.id = event_character_registrations.character_id
      and character.profile_id = event_character_registrations.profile_id
      and character.group_id = event.group_id
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
  and exists (
    select 1
    from public.characters character
    join public.raid_events event on event.id = event_character_registrations.raid_event_id
    where character.id = event_character_registrations.character_id
      and character.profile_id = event_character_registrations.profile_id
      and character.group_id = event.group_id
  )
);

drop policy if exists event_character_registrations_leader_manage on public.event_character_registrations;
create policy event_character_registrations_leader_manage on public.event_character_registrations
for all to authenticated
using (
  exists (
    select 1 from public.raid_events event
    where event.id = event_character_registrations.raid_event_id
      and event.status <> 'archived'
      and public.has_group_role(event.group_id, array['leader', 'admin']::public.member_role[])
  )
  and exists (
    select 1
    from public.characters character
    join public.raid_events event on event.id = event_character_registrations.raid_event_id
    where character.id = event_character_registrations.character_id
      and character.profile_id = event_character_registrations.profile_id
      and character.group_id = event.group_id
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
  and exists (
    select 1
    from public.characters character
    join public.raid_events event on event.id = event_character_registrations.raid_event_id
    where character.id = event_character_registrations.character_id
      and character.profile_id = event_character_registrations.profile_id
      and character.group_id = event.group_id
  )
);

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
        where character.id = character_id
          and character.profile_id = owner_id
          and character.group_id = event_group_id
          and not character.is_archived
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
