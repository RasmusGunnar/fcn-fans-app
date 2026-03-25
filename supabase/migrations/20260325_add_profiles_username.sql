alter table public.profiles
add column if not exists username text;

update public.profiles
set username = nullif(lower(btrim(username)), '')
where username is not null;

create unique index if not exists profiles_username_unique_idx
on public.profiles ((lower(username)))
where username is not null and btrim(username) <> '';

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is not null then
    new.username := lower(btrim(new.username));
    if new.username = '' then
      new.username := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_profile_username on public.profiles;

create trigger trg_normalize_profile_username
before insert or update on public.profiles
for each row
execute function public.normalize_profile_username();
