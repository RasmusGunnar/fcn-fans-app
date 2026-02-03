-- =====================================================
-- ONBOARDING SETUP
-- =====================================================
-- Purpose: Database schema for auth onboarding flow
-- Status: ⚠️ PENDING - Run this in Supabase Dashboard SQL Editor
-- =====================================================

-- 1) Profiles table (likely exists, but ensuring structure)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  bio text,
  avatar_url text,
  avatar_path text,
  onboarding_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for profiles
drop policy if exists "users_read_own_profile" on public.profiles;
create policy "users_read_own_profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "users_insert_own_profile" on public.profiles;
create policy "users_insert_own_profile" on public.profiles
  for insert with check (auth.uid() = id);

-- 2) Communities table (likely exists)
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text, -- 'fanfraktion', 'by', 'interesse', etc.
  avatar_url text,
  avatar_path text,
  created_at timestamptz default now()
);

alter table public.communities enable row level security;

drop policy if exists "communities_public_read" on public.communities;
create policy "communities_public_read" on public.communities
  for select using (true);

-- 3) Community memberships table (likely exists)
create table if not exists public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member',
  created_at timestamptz default now(),
  unique(community_id, user_id)
);

alter table public.community_memberships enable row level security;

drop policy if exists "users_read_own_memberships" on public.community_memberships;
create policy "users_read_own_memberships" on public.community_memberships
  for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_memberships" on public.community_memberships;
create policy "users_insert_own_memberships" on public.community_memberships
  for insert with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_memberships" on public.community_memberships;
create policy "users_delete_own_memberships" on public.community_memberships
  for delete using (auth.uid() = user_id);

-- 4) RPC function: ensure_profile (fallback if trigger doesn't exist)
drop function if exists public.ensure_profile(uuid);
create or replace function public.ensure_profile(user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, onboarding_complete)
  values (user_id, false)
  on conflict (id) do nothing;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.ensure_profile(uuid) to authenticated;

-- =====================================================
-- RECOMMENDED: Create trigger for automatic profile creation
-- =====================================================
-- NOTE: The app uses ensure_profile() as fallback, but it's recommended
-- to create a trigger that automatically creates profiles on signup.
-- Run this in Dashboard SQL Editor:
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer set search_path = public
-- as $$
-- begin
--   insert into public.profiles (id, onboarding_complete)
--   values (new.id, false);
--   return new;
-- end;
-- $$;
--
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function public.handle_new_user();
-- =====================================================

-- 5) Seed some initial communities for onboarding (optional)
insert into public.communities (name, description, category) values
  ('FC Nordsjælland Fans', 'Hovedgruppe for alle FCN fans', 'fanfraktion'),
  ('Farum', 'Fans fra Farum området', 'by'),
  ('København', 'FCN fans i København', 'by'),
  ('Udebane', 'Rejsehold til udekampe', 'interesse')
on conflict do nothing;
