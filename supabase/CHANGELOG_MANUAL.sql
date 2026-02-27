-- =====================================================
-- MANUAL DATABASE CHANGELOG
-- =====================================================
-- Purpose: Version-controlled record of all manual DB changes
-- executed in Supabase Dashboard SQL Editor (hosted instance)
--
-- IMPORTANT:
-- - All changes below have been executed manually in production
-- - Do NOT run `npx supabase db push` on hosted instances
-- - All SQL blocks are idempotent (safe to re-run)
-- - After each change: copy SQL here, commit to git
-- =====================================================

-- =====================================================
-- 2026-01-25: Communities RBAC + Avatars
-- =====================================================
-- Purpose: Add owner/admin roles, avatar support, visibility, RLS policies
-- Status: ✅ EXECUTED
-- SQL file: supabase/sql/2026-01-25_communities_rbac_avatars.sql
-- Context:
--   - Extends communities table with owner_id, avatar_path, avatar_url, avatar_kind, visibility
--   - Adds 'admin' role to community_members (owner/admin/member)
--   - Creates helper functions: is_community_owner(), is_community_admin()
--   - Adds comprehensive RLS policies for public/private communities
--   - Enables join/leave, promote/demote admin functionality
-- Instructions:
--   1. Open supabase/sql/2026-01-25_communities_rbac_avatars.sql
--   2. Copy all SQL to Supabase Dashboard → SQL Editor
--   3. Read comments carefully, run OPTION A (text constraint) or OPTION B (enum)
--   4. Verify with verification queries at end of file
--   5. Update this status to: ✅ EXECUTED
-- =====================================================

-- =====================================================
-- 2026-01-20: RBAC - App Admins Table
-- =====================================================
-- Purpose: System admin role for full platform access
-- Status: ✅ EXECUTED
-- Run in: Supabase Dashboard → SQL Editor
-- =====================================================

-- Create app_admins table (idempotent)
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Enable RLS on app_admins
alter table public.app_admins enable row level security;

-- Policy: Users can read their own admin status
drop policy if exists "read_own_admin_row" on public.app_admins;
create policy "read_own_admin_row" on public.app_admins
  for select
  using (auth.uid() = user_id);

-- Policy: Admins can manage other admins
drop policy if exists "admin_can_manage_app_admins" on public.app_admins;
create policy "admin_can_manage_app_admins" on public.app_admins
  for all
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- =====================================================
-- 2026-01-20: Seed First System Admin
-- =====================================================
-- Purpose: Add yourself as first system admin
-- Status: ⚠️ MANUAL ACTION REQUIRED
-- Instructions:
--   1. Get your user UUID from: Dashboard → Authentication → Users
--   2. Run: insert into public.app_admins(user_id) values ('YOUR-UUID-HERE');
--   3. Verify: select * from public.app_admins;
-- =====================================================

-- UNCOMMENT AND RUN ONCE (replace with your UUID):
-- insert into public.app_admins(user_id) values ('your-user-uuid-here');

-- =====================================================
-- 2026-01-20: News Items - Community Posting Fix
-- =====================================================
-- Purpose: Allow owner/admin to post news as community
-- Status: ✅ EXECUTED
-- Context: Fixed RLS to check community_members for owner/admin role
-- =====================================================

-- Drop and recreate news_items insert policy with correct community check
drop policy if exists "insert own news items" on public.news_items;
create policy "insert own news items" on public.news_items
  for insert with check (
    auth.uid() = created_by
    and (
      -- If posting as user, actor_type must be 'user' and actor_id must be user's id
      (actor_type = 'user' and actor_id = auth.uid())
      or
      -- If posting as community, user must be owner/admin of that community
      (actor_type = 'community' and actor_id is not null and exists (
        select 1 from public.community_members
        where community_id = actor_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
      ))
    )
  );

-- =====================================================
-- 2026-01-20: System Admin - Bypass Policies
-- =====================================================
-- Purpose: System admins get full access to all resources
-- Status: ✅ EXECUTED
-- Context: Enables system-wide moderation and management
-- =====================================================

-- 1) news_items: System admin full access
drop policy if exists "system_admin_full_access_news_items" on public.news_items;
create policy "system_admin_full_access_news_items" on public.news_items
  for all
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- 2) communities: System admin can update
drop policy if exists "system_admin_update_communities" on public.communities;
create policy "system_admin_update_communities" on public.communities
  for update
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- 3) communities: System admin can delete
drop policy if exists "system_admin_delete_communities" on public.communities;
create policy "system_admin_delete_communities" on public.communities
  for delete
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- 4) community_members: System admin can insert
drop policy if exists "system_admin_insert_community_members" on public.community_members;
create policy "system_admin_insert_community_members" on public.community_members
  for insert
  with check (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- 5) community_members: System admin can update roles
drop policy if exists "system_admin_update_community_members" on public.community_members;
create policy "system_admin_update_community_members" on public.community_members
  for update
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- 6) community_members: System admin can delete
drop policy if exists "system_admin_delete_community_members" on public.community_members;
create policy "system_admin_delete_community_members" on public.community_members
  for delete
  using (
    exists (
      select 1 from public.app_admins a 
      where a.user_id = auth.uid()
    )
  );

-- =====================================================
-- 2026-02-26: Communities - Hero Cover Image
-- =====================================================
-- Purpose: Add cover image path for community hero banner
-- Status: ⚠️ MANUAL ACTION REQUIRED
-- Run in: Supabase Dashboard → SQL Editor
-- =====================================================

alter table if exists public.communities
  add column if not exists cover_path text;

-- =====================================================
-- 2026-02-26: Communities - Location Fields
-- =====================================================
-- Purpose: Add coarse location label + geohash for community
-- Status: ⚠️ MANUAL ACTION REQUIRED
-- Run in: Supabase Dashboard → SQL Editor
-- =====================================================

alter table if exists public.communities
  add column if not exists location_label text,
  add column if not exists location_geohash text;

-- =====================================================
-- FUTURE CHANGES
-- =====================================================
-- Add new manual changes below with:
-- - Date (YYYY-MM-DD)
-- - Purpose/context
-- - Status (PENDING/EXECUTED)
-- - SQL blocks (idempotent)
-- =====================================================

-- =====================================================
-- 2026-01-20: Add location/geocoding fields to events and fixtures
-- =====================================================
-- Purpose: Enable map view with markers for events and matches
-- Status: ✅ EXECUTED (ran in Supabase Dashboard SQL Editor)
-- =====================================================

-- Add address and geocoding fields to events table
alter table public.events
  add column if not exists address_line1 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text default 'Danmark',
  add column if not exists address_text text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists place_name text,
  add column if not exists geocoded_at timestamptz;

-- Add geocoding fields to fixtures table
alter table public.fixtures
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists place_name text,
  add column if not exists geocoded_at timestamptz;

-- Create index on lat/lng for map queries
create index if not exists idx_events_lat_lng on public.events(lat, lng) where lat is not null and lng is not null;
create index if not exists idx_fixtures_lat_lng on public.fixtures(lat, lng) where lat is not null and lng is not null;

-- Example template:
-- =====================================================
-- YYYY-MM-DD: Feature Name
-- =====================================================
-- Purpose: What this change does
-- Status: ⚠️ PENDING / ✅ EXECUTED
-- Context: Why we need this
-- =====================================================
--
-- drop policy if exists "policy_name" on public.table_name;
-- create policy "policy_name" on public.table_name ...
-- =====================================================
