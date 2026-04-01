create table if not exists public.fan_activities (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('match', 'event')),
  parent_id uuid not null,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  type text not null check (char_length(btrim(type)) > 0),
  title text not null check (char_length(btrim(title)) > 0),
  body text null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  location_name text null,
  location_address text null,
  lat double precision null,
  lng double precision null,
  cover_url text null,
  is_published boolean not null default false,
  is_cancelled boolean not null default false,
  sort_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fan_activities_ends_after_start
    check (ends_at is null or ends_at >= starts_at),
  constraint fan_activities_sort_order_nonnegative
    check (sort_order is null or sort_order >= 0)
);

create index if not exists idx_fan_activities_parent
  on public.fan_activities (parent_type, parent_id);

create index if not exists idx_fan_activities_community_id
  on public.fan_activities (community_id);

create index if not exists idx_fan_activities_parent_sort
  on public.fan_activities (parent_type, parent_id, starts_at, sort_order, created_at desc);

create index if not exists idx_fan_activities_community_sort
  on public.fan_activities (community_id, starts_at, sort_order, created_at desc);

create index if not exists idx_fan_activities_published_parent
  on public.fan_activities (parent_type, parent_id, starts_at, sort_order)
  where is_published = true and is_cancelled = false;

-- NOTE:
-- The automated migrations chain creates public.community_members with
-- roles ('owner', 'member') only. The broader owner/admin helpers live in
-- supabase/sql as manual SQL and are not guaranteed to be deployed.
-- V1 therefore uses the safest migration-only rule: owner can manage.
create or replace function public.can_manage_fan_activity_community(
  p_community_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_community_id is null or p_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = p_user_id
      and cm.role = 'owner'
  );
end;
$$;

create or replace function public.validate_fan_activity_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_type = 'match' then
    if not exists (
      select 1
      from public.fixtures f
      where f.id = new.parent_id
    ) then
      raise exception 'fan_activities.parent_id does not reference an existing fixture: %', new.parent_id
        using errcode = '23503';
    end if;
  elsif new.parent_type = 'event' then
    if not exists (
      select 1
      from public.events e
      where e.id = new.parent_id
    ) then
      raise exception 'fan_activities.parent_id does not reference an existing event: %', new.parent_id
        using errcode = '23503';
    end if;
  else
    raise exception 'Unsupported fan_activities.parent_type: %', new.parent_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.set_fan_activities_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fan_activities_validate_parent on public.fan_activities;
create trigger trg_fan_activities_validate_parent
  before insert or update on public.fan_activities
  for each row
  execute function public.validate_fan_activity_parent();

drop trigger if exists trg_fan_activities_set_updated_at on public.fan_activities;
create trigger trg_fan_activities_set_updated_at
  before insert or update on public.fan_activities
  for each row
  execute function public.set_fan_activities_updated_at();

alter table public.fan_activities enable row level security;

drop policy if exists "fan_activities_select_published" on public.fan_activities;
create policy "fan_activities_select_published"
  on public.fan_activities
  for select
  using (is_published = true);

drop policy if exists "fan_activities_select_community_admin" on public.fan_activities;
drop policy if exists "fan_activities_select_community_owner" on public.fan_activities;
create policy "fan_activities_select_community_owner"
  on public.fan_activities
  for select
  to authenticated
  using (public.can_manage_fan_activity_community(community_id, auth.uid()));

drop policy if exists "fan_activities_insert_community_admin" on public.fan_activities;
drop policy if exists "fan_activities_insert_community_owner" on public.fan_activities;
create policy "fan_activities_insert_community_owner"
  on public.fan_activities
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and public.can_manage_fan_activity_community(community_id, auth.uid())
  );

drop policy if exists "fan_activities_update_community_admin" on public.fan_activities;
drop policy if exists "fan_activities_update_community_owner" on public.fan_activities;
create policy "fan_activities_update_community_owner"
  on public.fan_activities
  for update
  to authenticated
  using (public.can_manage_fan_activity_community(community_id, auth.uid()))
  with check (public.can_manage_fan_activity_community(community_id, auth.uid()));
