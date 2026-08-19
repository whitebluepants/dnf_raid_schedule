-- A newly registered user must have a profile before the first request that
-- needs space membership. This trigger avoids depending on a freshly-issued
-- browser session being visible to a second RLS-protected query.
create or replace function public.bootstrap_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_name text;
begin
  profile_name := left(
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), '新成员'),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, profile_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bootstrap_profile on auth.users;
create trigger on_auth_user_created_bootstrap_profile
after insert on auth.users
for each row execute function public.bootstrap_profile_from_auth_user();
