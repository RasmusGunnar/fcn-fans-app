alter table public.push_preferences
add column if not exists mentions_enabled boolean not null default true;

update public.push_preferences
set mentions_enabled = true
where mentions_enabled is null;
