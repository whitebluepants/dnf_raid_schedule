alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- One-time bootstrap only. A later profile that claims this display name does
-- not receive privileges because no trigger or client input participates.
update public.profiles
set is_platform_admin = true
where id = (
  select id
  from public.profiles
  where btrim(display_name) = '蓝'
  order by created_at, id
  limit 1
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select profile.is_platform_admin
    from public.profiles profile
    where profile.id = auth.uid()
  ), false)
$$;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.group_members membership
    where membership.group_id = target_group_id
      and membership.profile_id = auth.uid()
  )
$$;

create or replace function public.has_group_role(
  target_group_id uuid,
  roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.group_members membership
    where membership.group_id = target_group_id
      and membership.profile_id = auth.uid()
      and membership.role = any(roles)
  )
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists profiles_select_self_or_peer on public.profiles;
create policy profiles_select_self_or_peer on public.profiles
for select to authenticated
using (
  id = public.current_profile_id()
  or public.is_platform_admin()
  or exists (
    select 1
    from public.group_members self_membership
    join public.group_members peer_membership
      on peer_membership.group_id = self_membership.group_id
    where self_membership.profile_id = public.current_profile_id()
      and peer_membership.profile_id = profiles.id
  )
);

-- Table-level INSERT/UPDATE grants would let a user set their own platform flag.
-- Keep the existing self RLS policies, but expose only ordinary profile fields.
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (id, display_name, updated_at) on public.profiles to authenticated;

-- Invite codes and ownership are immutable through the table API. Space names
-- remain editable under the existing groups_admin_update RLS policy.
revoke update on public.groups from authenticated;
grant update (name, updated_at) on public.groups to authenticated;
revoke select on public.groups from authenticated;
grant select (id, name, invite_code, created_by, created_at, updated_at)
  on public.groups to authenticated;

drop policy if exists group_members_admin_manage on public.group_members;

drop function if exists public.create_group(text, text);
create function public.create_group(p_name text)
returns table(group_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := auth.uid();
  generated_code text;
  new_group_id uuid;
begin
  if owner_id is null
    or length(btrim(p_name)) not between 1 and 120
    or not exists (select 1 from public.profiles where id = owner_id)
  then
    raise exception 'invalid_group_input';
  end if;

  loop
    generated_code := 'DNF-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));
    begin
      insert into public.groups (name, invite_code_digest, invite_code, created_by)
      values (
        btrim(p_name),
        encode(extensions.digest(generated_code, 'sha256'), 'hex'),
        generated_code,
        owner_id
      )
      returning id into new_group_id;
      exit;
    exception when unique_violation then
      -- A concurrent collision retries with fresh cryptographic randomness.
    end;
  end loop;

  insert into public.group_members (group_id, profile_id, role)
  values (new_group_id, owner_id, 'admin');

  group_id := new_group_id;
  invite_code := generated_code;
  return next;
end;
$$;

drop function if exists public.join_group_by_invite(text, text);
create or replace function public.join_group_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := auth.uid();
  matched_group_id uuid;
begin
  if owner_id is null
    or length(btrim(p_invite_code)) not between 6 and 64
    or not exists (select 1 from public.profiles where id = owner_id)
  then
    raise exception 'invalid_onboarding_input';
  end if;

  select id into matched_group_id
  from public.groups
  where invite_code_digest = encode(
    extensions.digest(upper(btrim(p_invite_code)), 'sha256'),
    'hex'
  );

  if matched_group_id is null then
    raise exception 'invite_not_found';
  end if;

  insert into public.group_members (group_id, profile_id, role)
  values (matched_group_id, owner_id, 'member')
  on conflict (group_id, profile_id) do nothing;

  return matched_group_id;
end;
$$;

create or replace function public.get_space_context(p_group_id uuid)
returns table(
  profile_id uuid,
  group_id uuid,
  role public.member_role,
  is_platform_admin boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := auth.uid();
  platform_admin boolean := public.is_platform_admin();
begin
  if owner_id is null or not exists (
    select 1 from public.groups target_group where target_group.id = p_group_id
  ) then
    return;
  end if;

  if platform_admin then
    return query select owner_id, p_group_id, 'admin'::public.member_role, true;
    return;
  end if;

  return query
  select membership.profile_id, membership.group_id, membership.role, false
  from public.group_members membership
  where membership.group_id = p_group_id
    and membership.profile_id = owner_id;
end;
$$;

create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_profile_id uuid,
  p_role public.member_role
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'invalid_member_role';
  end if;

  if not (
    public.is_platform_admin()
    or exists (
      select 1
      from public.group_members actor
      where actor.group_id = p_group_id
        and actor.profile_id = auth.uid()
        and actor.role = 'admin'
    )
  ) then
    raise exception 'member_role_forbidden';
  end if;

  if not exists (
    select 1
    from public.group_members target_member
    where target_member.group_id = p_group_id
      and target_member.profile_id = p_profile_id
  ) then
    raise exception 'target_not_in_group';
  end if;

  update public.group_members
  set role = p_role
  where group_id = p_group_id and profile_id = p_profile_id;

  return true;
end;
$$;

revoke all on function public.create_group(text) from public;
revoke all on function public.join_group_by_invite(text) from public;
revoke all on function public.get_space_context(uuid) from public;
revoke all on function public.set_group_member_role(uuid, uuid, public.member_role) from public;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;
grant execute on function public.get_space_context(uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, public.member_role) to authenticated;
