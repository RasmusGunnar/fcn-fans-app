alter table public.communities
  add column if not exists mention_key text;

create or replace function public.normalize_mention_handle(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  normalized := lower(btrim(coalesce(value, '')));
  normalized := regexp_replace(normalized, '^@+', '');
  normalized := replace(normalized, chr(230), 'ae');
  normalized := replace(normalized, chr(248), 'oe');
  normalized := replace(normalized, chr(229), 'aa');
  normalized := regexp_replace(normalized, '\s+', '_', 'g');
  normalized := regexp_replace(normalized, '[^a-z0-9_]+', '', 'g');
  normalized := regexp_replace(normalized, '_+', '_', 'g');
  normalized := regexp_replace(normalized, '^_+|_+$', '', 'g');

  if normalized = '' then
    return null;
  end if;

  return normalized;
end;
$$;

create or replace function public.generate_unique_community_mention_key(
  p_name text,
  p_community_id uuid default null
)
returns text
language plpgsql
as $$
declare
  base_key text;
  candidate text;
  suffix text;
begin
  base_key := public.normalize_mention_handle(p_name);
  if base_key is null or base_key = '' then
    base_key := 'community';
  end if;

  if p_community_id is null then
    p_community_id := gen_random_uuid();
  end if;

  candidate := base_key;

  if not exists (
    select 1
    from public.communities c
    where c.mention_key = candidate
      and c.id <> p_community_id
  ) and not exists (
    select 1
    from public.profiles p
    where lower(coalesce(p.username, '')) = candidate
  ) then
    return candidate;
  end if;

  suffix := substring(replace(p_community_id::text, '-', '') from 1 for 6);
  candidate := left(base_key, 48) || '_' || suffix;

  while exists (
    select 1
    from public.communities c
    where c.mention_key = candidate
      and c.id <> p_community_id
  ) or exists (
    select 1
    from public.profiles p
    where lower(coalesce(p.username, '')) = candidate
  ) loop
    suffix := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6);
    candidate := left(base_key, 48) || '_' || suffix;
  end loop;

  return candidate;
end;
$$;

create or replace function public.ensure_community_mention_key()
returns trigger
language plpgsql
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.mention_key is null or btrim(new.mention_key) = '' then
    new.mention_key := public.generate_unique_community_mention_key(new.name, new.id);
    return new;
  end if;

  new.mention_key := public.normalize_mention_handle(new.mention_key);

  if new.mention_key is null or new.mention_key = '' then
    new.mention_key := public.generate_unique_community_mention_key(new.name, new.id);
    return new;
  end if;

  if exists (
    select 1
    from public.communities c
    where c.mention_key = new.mention_key
      and c.id <> new.id
  ) then
    raise exception 'Community mention key "%" is already in use', new.mention_key;
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(coalesce(p.username, '')) = new.mention_key
  ) then
    raise exception 'Community mention key "%" conflicts with an existing profile username', new.mention_key;
  end if;

  return new;
end;
$$;

create or replace function public.ensure_profile_mention_handle_conflict_free()
returns trigger
language plpgsql
as $$
declare
  normalized_username text;
begin
  normalized_username := lower(btrim(coalesce(new.username, '')));

  if normalized_username = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.communities c
    where c.mention_key = normalized_username
  ) then
    raise exception 'Profile username "%" conflicts with an existing community mention key', normalized_username;
  end if;

  return new;
end;
$$;

update public.communities c
set mention_key = public.generate_unique_community_mention_key(c.name, c.id)
where c.mention_key is null
   or btrim(c.mention_key) = '';

drop trigger if exists trg_ensure_community_mention_key on public.communities;
create trigger trg_ensure_community_mention_key
before insert or update of name, mention_key
on public.communities
for each row
execute function public.ensure_community_mention_key();

drop trigger if exists trg_validate_profile_mention_handle_conflict on public.profiles;
create trigger trg_validate_profile_mention_handle_conflict
before insert or update of username
on public.profiles
for each row
execute function public.ensure_profile_mention_handle_conflict_free();

create unique index if not exists communities_mention_key_unique_idx
on public.communities ((lower(mention_key)))
where mention_key is not null and btrim(mention_key) <> '';
