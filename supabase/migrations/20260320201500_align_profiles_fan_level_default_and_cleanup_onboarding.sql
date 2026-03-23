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
  add column if not exists onboarding_complete boolean default false;

update public.profiles
set onboarding_complete = true
where onboarding_complete is distinct from true
  and coalesce(trim(display_name), '') <> ''
  and coalesce(trim(avatar_url), '') <> '';
