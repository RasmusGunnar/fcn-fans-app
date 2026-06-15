-- =====================================================
-- Migration: RBAC System - App Admins
-- =====================================================
-- Purpose: Implement system admin role + admin bypass policies
-- Critical: ADDITIVE ONLY - does not modify existing tables/policies
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
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "read_own_admin_row" on public.app_admins
      for select
      using (auth.uid() = user_id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "read_own_admin_row" already exists, skipping';
  END;
END $$;

-- Policy: Admins can manage other admins (insert/update/delete)
drop policy if exists "admin_can_manage_app_admins" on public.app_admins;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "admin_can_manage_app_admins" on public.app_admins
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
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "admin_can_manage_app_admins" already exists, skipping';
  END;
END $$;

-- =====================================================
-- ADMIN BYPASS POLICIES (additive only)
-- =====================================================

-- 1) news_items: System admin full access
drop policy if exists "system_admin_full_access_news_items" on public.news_items;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_full_access_news_items" on public.news_items
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
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_full_access_news_items" already exists, skipping';
  END;
END $$;

-- 2) communities: System admin can update/delete
drop policy if exists "system_admin_update_communities" on public.communities;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_update_communities" on public.communities
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
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_update_communities" already exists, skipping';
  END;
END $$;

drop policy if exists "system_admin_delete_communities" on public.communities;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_delete_communities" on public.communities
      for delete
      using (
        exists (
          select 1 from public.app_admins a 
          where a.user_id = auth.uid()
        )
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_delete_communities" already exists, skipping';
  END;
END $$;

-- 3) community_members: System admin can manage roles
drop policy if exists "system_admin_insert_community_members" on public.community_members;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_insert_community_members" on public.community_members
      for insert
      with check (
        exists (
          select 1 from public.app_admins a 
          where a.user_id = auth.uid()
        )
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_insert_community_members" already exists, skipping';
  END;
END $$;

drop policy if exists "system_admin_update_community_members" on public.community_members;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_update_community_members" on public.community_members
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
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_update_community_members" already exists, skipping';
  END;
END $$;

drop policy if exists "system_admin_delete_community_members" on public.community_members;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "system_admin_delete_community_members" on public.community_members
      for delete
      using (
        exists (
          select 1 from public.app_admins a 
          where a.user_id = auth.uid()
        )
      )';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "system_admin_delete_community_members" already exists, skipping';
  END;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- Next steps:
-- 1. Run this migration in Supabase Dashboard SQL Editor
-- 2. Manually seed first admin: 
--    insert into public.app_admins(user_id) values ('<your-user-uuid>');
-- 3. System admins can now add other admins via dashboard/SQL
-- =====================================================
