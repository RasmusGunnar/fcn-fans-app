-- =====================================================
-- Migration: Fix infinite RLS recursion on app_admins
-- =====================================================
-- Problem:
--   PostgreSQL error 42P17 "infinite recursion detected in policy for relation 'app_admins'"
--   Triggered when updating events (EditEventScreen save).
--
-- Root cause:
--   1. The events UPDATE policy does: EXISTS (SELECT 1 FROM app_admins WHERE ...)
--   2. That SELECT on app_admins triggers RLS evaluation on app_admins.
--   3. The "admin_can_manage_app_admins" policy (FOR ALL, includes SELECT) has USING:
--        EXISTS (SELECT 1 FROM app_admins WHERE ...)  — self-referential!
--   4. This inner SELECT again triggers app_admins RLS → infinite recursion.
--
-- Fix:
--   A) Ensure the SECURITY DEFINER function public.is_app_admin() exists.
--      It runs as the definer (superuser), so its internal SELECT on app_admins
--      bypasses RLS entirely — no recursion possible.
--   B) Replace the self-referential "admin_can_manage_app_admins" policy
--      with one that calls public.is_app_admin() instead of inline EXISTS.
--   C) Replace all inline EXISTS(... app_admins ...) in events, news_items,
--      communities, and community_members policies with public.is_app_admin().
--
-- All statements are idempotent (DROP IF EXISTS + CREATE, CREATE OR REPLACE).
-- =====================================================

-- ==========================================
-- STEP 1: Ensure SECURITY DEFINER function
-- ==========================================
-- CREATE OR REPLACE is inherently idempotent.
-- SECURITY DEFINER = runs with definer's privileges, bypasses RLS on app_admins.
-- STABLE = can be cached within a single statement (performance).

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
  );
END;
$$;

-- Ensure authenticated users can call it
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- ==========================================
-- STEP 2: Fix app_admins self-policies
-- ==========================================
-- "read_own_admin_row" is safe (no sub-select), keep it.
-- "admin_can_manage_app_admins" is the recursive one — replace it.

DROP POLICY IF EXISTS "admin_can_manage_app_admins" ON public.app_admins;

-- New policy: admins can INSERT/UPDATE/DELETE other admin rows.
-- Uses the SECURITY DEFINER function so no self-referential SELECT happens.
CREATE POLICY "admin_can_manage_app_admins" ON public.app_admins
  FOR ALL
  TO authenticated
  USING  ( public.is_app_admin() )
  WITH CHECK ( public.is_app_admin() );

-- ==========================================
-- STEP 3: Fix events policies
-- ==========================================
-- Replace inline EXISTS(... app_admins ...) with public.is_app_admin()

DROP POLICY IF EXISTS "Events: update by owner/admin" ON public.events;
CREATE POLICY "Events: update by owner/admin" ON public.events
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = creator_user_id
    OR public.is_app_admin()
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  )
  WITH CHECK (
    auth.uid() = creator_user_id
    OR public.is_app_admin()
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  );

DROP POLICY IF EXISTS "Events: delete by owner/admin" ON public.events;
CREATE POLICY "Events: delete by owner/admin" ON public.events
  FOR DELETE TO authenticated
  USING (
    auth.uid() = creator_user_id
    OR public.is_app_admin()
    OR (
      organizer_type = 'community'
      AND EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = organizer_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner','admin')
      )
    )
  );

-- ==========================================
-- STEP 4: Fix news_items admin bypass policy
-- ==========================================
-- The older "system_admin_full_access_news_items" used inline EXISTS.
-- The newer news_items_rls migration already uses is_app_admin(), but
-- the legacy FOR ALL policy may still be active. Drop it and rely on
-- the per-operation policies from 20260216090000_news_items_rls.sql.

DROP POLICY IF EXISTS "system_admin_full_access_news_items" ON public.news_items;

-- ==========================================
-- STEP 5: Fix communities admin policies
-- ==========================================

DROP POLICY IF EXISTS "system_admin_update_communities" ON public.communities;
CREATE POLICY "system_admin_update_communities" ON public.communities
  FOR UPDATE TO authenticated
  USING  ( public.is_app_admin() )
  WITH CHECK ( public.is_app_admin() );

DROP POLICY IF EXISTS "system_admin_delete_communities" ON public.communities;
CREATE POLICY "system_admin_delete_communities" ON public.communities
  FOR DELETE TO authenticated
  USING ( public.is_app_admin() );

-- ==========================================
-- STEP 6: Fix community_members admin policies
-- ==========================================

DROP POLICY IF EXISTS "system_admin_insert_community_members" ON public.community_members;
CREATE POLICY "system_admin_insert_community_members" ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_app_admin() );

DROP POLICY IF EXISTS "system_admin_update_community_members" ON public.community_members;
CREATE POLICY "system_admin_update_community_members" ON public.community_members
  FOR UPDATE TO authenticated
  USING  ( public.is_app_admin() )
  WITH CHECK ( public.is_app_admin() );

DROP POLICY IF EXISTS "system_admin_delete_community_members" ON public.community_members;
CREATE POLICY "system_admin_delete_community_members" ON public.community_members
  FOR DELETE TO authenticated
  USING ( public.is_app_admin() );

-- ==========================================
-- Migration complete.
-- Test: supabase db push, then save an event in EditEventScreen.
-- ==========================================
