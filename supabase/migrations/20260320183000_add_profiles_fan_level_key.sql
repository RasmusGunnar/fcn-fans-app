alter table public.profiles
  add column if not exists fan_level_key text;

update public.profiles
set fan_level_key = 'new_fan'
where fan_level_key is null
   or fan_level_key not in (
     'new_fan',
     'community_member',
     'regular_voice',
     'community_core',
     'dedicated',
     'top_fan'
   );

alter table public.profiles
  alter column fan_level_key set default 'new_fan';

alter table public.profiles
  alter column fan_level_key set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_fan_level_key_check'
  ) then
    alter table public.profiles
      drop constraint profiles_fan_level_key_check;
  end if;

  alter table public.profiles
    add constraint profiles_fan_level_key_check
    check (
      fan_level_key in (
        'new_fan',
        'community_member',
        'regular_voice',
        'community_core',
        'dedicated',
        'top_fan'
      )
    );
end $$;
