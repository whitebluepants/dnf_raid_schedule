-- Supabase installs pgcrypto in the `extensions` schema. The application
-- functions pin their search path for security, so extension functions must be
-- schema-qualified instead of relying on the database default search path.
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

  insert into public.groups (name, invite_code_digest, invite_code, created_by)
  values (
    btrim(p_name),
    encode(extensions.digest(upper(btrim(p_invite_code)), 'sha256'), 'hex'),
    btrim(p_invite_code),
    owner_id
  )
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
  p_nickname text default null
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
  if owner_id is null or length(btrim(p_invite_code)) not between 6 and 64 then
    raise exception 'invalid_onboarding_input';
  end if;

  insert into public.profiles (id, display_name)
  values (owner_id, coalesce(nullif(btrim(p_nickname), ''), '成员'))
  on conflict (id) do nothing;

  select id into matched_group_id
  from public.groups
  where invite_code_digest = encode(extensions.digest(upper(btrim(p_invite_code)), 'sha256'), 'hex');
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
