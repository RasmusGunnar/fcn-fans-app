-- Migration: Add profile fields for user display
-- This migration extends the profiles table with display_name, avatar_url, and member_since

-- Add columns if they don't exist
alter table public.profiles 
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists member_since timestamp with time zone default now();

-- Create communities table if not exists
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null default 'community' check (type in ('community', 'fan_faction')),
  logo_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create community_members table if not exists
create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamp with time zone default now(),
  unique(community_id, user_id)
);

-- Create user_upcoming_items table if not exists
create table if not exists public.user_upcoming_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('match', 'bus_trip', 'event')),
  target_id uuid not null,
  status text not null check (status in ('going', 'interested', 'not_going')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, target_type, target_id)
);

-- Enable RLS
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.user_upcoming_items enable row level security;

-- RLS policies for communities
create policy "read all communities" on public.communities
  for select using (true);

create policy "insert own community" on public.communities
  for insert with check (auth.uid() = created_by);

create policy "update own community" on public.communities
  for update using (
    exists (
      select 1 from public.community_members
      where community_id = communities.id
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

-- RLS policies for community_members
create policy "read all members" on public.community_members
  for select using (true);

create policy "insert own membership" on public.community_members
  for insert with check (auth.uid() = user_id or auth.uid() in (
    select user_id from public.community_members
    where community_id = community_members.community_id
    and role = 'owner'
  ));

create policy "delete own membership" on public.community_members
  for delete using (auth.uid() = user_id);

-- RLS policies for user_upcoming_items
create policy "read own upcoming items" on public.user_upcoming_items
  for select using (auth.uid() = user_id);

create policy "insert own upcoming items" on public.user_upcoming_items
  for insert with check (auth.uid() = user_id);

create policy "update own upcoming items" on public.user_upcoming_items
  for update using (auth.uid() = user_id);

create policy "delete own upcoming items" on public.user_upcoming_items
  for delete using (auth.uid() = user_id);

-- Create indexes for performance
create index if not exists idx_community_members_user_id on public.community_members(user_id);
create index if not exists idx_community_members_community_id on public.community_members(community_id);
create index if not exists idx_user_upcoming_items_user_id on public.user_upcoming_items(user_id);
create index if not exists idx_user_upcoming_items_target on public.user_upcoming_items(target_type, target_id);

-- Create a trigger to auto-populate member_since on profile creation
create or replace function public.set_member_since()
returns trigger as $$
begin
  if new.member_since is null then
    new.member_since := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger set_member_since_trigger
  before insert on public.profiles
  for each row
  execute function public.set_member_since();
