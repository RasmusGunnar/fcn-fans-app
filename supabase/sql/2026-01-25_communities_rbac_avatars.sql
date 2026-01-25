-- =====================================================
-- 2026-01-25: Communities RBAC + Avatars
-- =====================================================
-- Purpose: Add owner/admin roles, avatar support, visibility, RLS policies
-- Status: ⚠️ TO RUN (manual execution in Supabase Dashboard SQL Editor)
--
-- IMPORTANT:
-- 1) This SQL is ADDITIVE - safe to run on existing data
-- 2) All columns are nullable for backward compatibility
-- 3) Read the comments carefully before running OPTION A or OPTION B
-- 4) After running, update CHANGELOG_MANUAL.sql status to EXECUTED
-- 5) Existing system_admin policies will NOT be modified
-- =====================================================

-- =====================================================
-- STEP 1: INTROSPECTION (Optional - run first)
-- =====================================================
-- Uncomment and run these queries first to understand current schema:

-- Check communities table structure:
/*
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'communities'
ORDER BY ordinal_position;
*/

-- Check community_members role constraint:
/*
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
AND constraint_name LIKE '%community_members%role%';
*/

-- Check existing policies:
/*
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('communities', 'community_members')
ORDER BY tablename, policyname;
*/

-- =====================================================
-- STEP 2: EXTEND COMMUNITIES TABLE
-- =====================================================
-- Add new columns (all nullable for backward compatibility)

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_kind text,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';

-- Add check constraints for new columns (idempotent)
DO $$
BEGIN
  -- Check constraint for avatar_kind
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'communities' 
    AND constraint_name = 'communities_avatar_kind_check'
  ) THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_avatar_kind_check 
      CHECK (avatar_kind IN ('logo', 'image'));
  END IF;

  -- Check constraint for visibility
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'communities' 
    AND constraint_name = 'communities_visibility_check'
  ) THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_visibility_check 
      CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

-- One-time data migration: copy created_by to owner_id (idempotent)
UPDATE public.communities
SET owner_id = created_by
WHERE owner_id IS NULL AND created_by IS NOT NULL;

-- Create index for faster avatar lookups
CREATE INDEX IF NOT EXISTS idx_communities_avatar_path 
ON public.communities(avatar_path) 
WHERE avatar_path IS NOT NULL;

-- =====================================================
-- STEP 3: EXTEND ROLE CONSTRAINT TO INCLUDE 'admin'
-- =====================================================
-- CRITICAL: Choose OPTION A or OPTION B based on your schema
-- Run introspection query above first to check role datatype!

-- ────────────────────────────────────────────────────
-- OPTION A: role is text/varchar with CHECK constraint
-- ────────────────────────────────────────────────────
-- This is the RECOMMENDED option for this schema
-- Run this if role column is text datatype:

ALTER TABLE public.community_members
  DROP CONSTRAINT IF EXISTS community_members_role_check;

ALTER TABLE public.community_members
  ADD CONSTRAINT community_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member'));

-- ────────────────────────────────────────────────────
-- OPTION B: role is enum type
-- ────────────────────────────────────────────────────
-- ONLY use this if introspection shows role is an enum!
-- Uncomment below ONLY if role column is enum datatype:

-- ALTER TYPE community_role ADD VALUE IF NOT EXISTS 'admin';

-- =====================================================
-- STEP 4: HELPER FUNCTIONS FOR RLS POLICIES
-- =====================================================

-- Helper: Check if user is owner of a community
CREATE OR REPLACE FUNCTION public.is_community_owner(
  p_community_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
    AND user_id = p_user_id
    AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Check if user is owner OR admin of a community
CREATE OR REPLACE FUNCTION public.is_community_admin(
  p_community_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
    AND user_id = p_user_id
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- STEP 5: RLS POLICIES FOR COMMUNITIES TABLE
-- =====================================================
-- NOTE: Existing system_admin policies are NOT modified

-- Policy: Public visibility - anyone can read public communities
DROP POLICY IF EXISTS "communities_select_public" ON public.communities;
CREATE POLICY "communities_select_public" ON public.communities
  FOR SELECT
  USING (
    visibility = 'public' 
    OR visibility IS NULL  -- backward compatibility
  );

-- Policy: Private visibility - members can read their private communities
DROP POLICY IF EXISTS "communities_select_private_members" ON public.communities;
CREATE POLICY "communities_select_private_members" ON public.communities
  FOR SELECT
  USING (
    visibility = 'private'
    AND EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
      AND cm.user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can create communities
DROP POLICY IF EXISTS "communities_insert_authenticated" ON public.communities;
CREATE POLICY "communities_insert_authenticated" ON public.communities
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (owner_id = auth.uid() OR created_by = auth.uid())
  );

-- Policy: Owner/admin can update community (avatar, name, description, etc.)
DROP POLICY IF EXISTS "communities_update_owner_admin" ON public.communities;
CREATE POLICY "communities_update_owner_admin" ON public.communities
  FOR UPDATE
  USING (
    public.is_community_admin(id, auth.uid())
  )
  WITH CHECK (
    public.is_community_admin(id, auth.uid())
  );

-- Policy: Owner can delete community
DROP POLICY IF EXISTS "communities_delete_owner" ON public.communities;
CREATE POLICY "communities_delete_owner" ON public.communities
  FOR DELETE
  USING (
    public.is_community_owner(id, auth.uid())
  );

-- =====================================================
-- STEP 6: RLS POLICIES FOR COMMUNITY_MEMBERS TABLE
-- =====================================================
-- NOTE: Existing system_admin policies are NOT modified

-- Policy: Read members of public communities
DROP POLICY IF EXISTS "community_members_select_public_communities" ON public.community_members;
CREATE POLICY "community_members_select_public_communities" ON public.community_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
      AND (c.visibility = 'public' OR c.visibility IS NULL)
    )
  );

-- Policy: Members can read other members in their private communities
DROP POLICY IF EXISTS "community_members_select_private_communities" ON public.community_members;
CREATE POLICY "community_members_select_private_communities" ON public.community_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
      AND c.visibility = 'private'
      AND EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = c.id
        AND cm.user_id = auth.uid()
      )
    )
  );

-- Policy: Authenticated users can join as 'member' (self-insert only)
DROP POLICY IF EXISTS "community_members_insert_self_join" ON public.community_members;
CREATE POLICY "community_members_insert_self_join" ON public.community_members
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
  );

-- Policy: Users can leave community (delete own membership)
DROP POLICY IF EXISTS "community_members_delete_self" ON public.community_members;
CREATE POLICY "community_members_delete_self" ON public.community_members
  FOR DELETE
  USING (
    auth.uid() = user_id
  );

-- Policy: Owner can promote/demote admin (update member roles)
DROP POLICY IF EXISTS "community_members_update_role_owner_only" ON public.community_members;
CREATE POLICY "community_members_update_role_owner_only" ON public.community_members
  FOR UPDATE
  USING (
    public.is_community_owner(community_id, auth.uid())
    -- Prevent owner from modifying their own role
    AND user_id != auth.uid()
  )
  WITH CHECK (
    public.is_community_owner(community_id, auth.uid())
    AND user_id != auth.uid()
  );

-- Policy: Admin can remove members (but not owner, not themselves)
DROP POLICY IF EXISTS "community_members_delete_admin_removes" ON public.community_members;
CREATE POLICY "community_members_delete_admin_removes" ON public.community_members
  FOR DELETE
  USING (
    public.is_community_admin(community_id, auth.uid())
    AND user_id != auth.uid()  -- Can't remove self
    AND NOT public.is_community_owner(community_id, user_id)  -- Can't remove owner
  );

-- =====================================================
-- STEP 7: INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for faster role lookups (composite)
CREATE INDEX IF NOT EXISTS idx_community_members_role 
ON public.community_members(community_id, role);

-- Index for user membership lookups (composite)
CREATE INDEX IF NOT EXISTS idx_community_members_user_community 
ON public.community_members(user_id, community_id);

-- Index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_communities_visibility 
ON public.communities(visibility);

-- =====================================================
-- STEP 8: VERIFICATION QUERIES
-- =====================================================
-- Uncomment and run these after executing the SQL above:

-- ────────────────────────────────────────────────────
-- Verify new columns exist on communities table:
-- ────────────────────────────────────────────────────
/*
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'communities'
AND column_name IN ('owner_id', 'avatar_path', 'avatar_url', 'avatar_kind', 'visibility')
ORDER BY column_name;
*/

-- ────────────────────────────────────────────────────
-- Verify role constraint updated to include 'admin':
-- ────────────────────────────────────────────────────
/*
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
AND constraint_name = 'community_members_role_check';
-- Should show: (role IN ('owner', 'admin', 'member'))
*/

-- ────────────────────────────────────────────────────
-- Verify check constraints on communities:
-- ────────────────────────────────────────────────────
/*
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
AND table_name = 'communities'
AND constraint_name IN ('communities_avatar_kind_check', 'communities_visibility_check');
*/

-- ────────────────────────────────────────────────────
-- Verify new policies created:
-- ────────────────────────────────────────────────────
/*
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE tablename IN ('communities', 'community_members')
AND policyname IN (
  'communities_select_public',
  'communities_update_owner_admin',
  'community_members_select_public_communities',
  'community_members_insert_self_join',
  'community_members_delete_self',
  'community_members_update_role_owner_only'
)
ORDER BY tablename, policyname;
*/

-- ────────────────────────────────────────────────────
-- Verify helper functions exist:
-- ────────────────────────────────────────────────────
/*
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('is_community_owner', 'is_community_admin');
*/

-- ────────────────────────────────────────────────────
-- Verify indexes created:
-- ────────────────────────────────────────────────────
/*
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_communit%'
ORDER BY tablename, indexname;
*/

-- ────────────────────────────────────────────────────
-- Test helper functions (replace UUID with real community ID):
-- ────────────────────────────────────────────────────
/*
-- Replace 'your-community-uuid-here' with actual community ID:
SELECT 
  public.is_community_owner('your-community-uuid-here'::uuid) as is_owner,
  public.is_community_admin('your-community-uuid-here'::uuid) as is_admin;
*/

-- =====================================================
-- POST-EXECUTION CHECKLIST
-- =====================================================
-- [ ] Step 2: Communities table columns added successfully
-- [ ] Step 3: Role constraint updated (OPTION A or B executed)
-- [ ] Step 4: Helper functions created (is_community_owner, is_community_admin)
-- [ ] Step 5: Communities RLS policies created without errors
-- [ ] Step 6: Community_members RLS policies created without errors
-- [ ] Step 7: Performance indexes created
-- [ ] Step 8: All verification queries run successfully
-- [ ] Existing system_admin policies still intact (not modified)
-- [ ] Update CHANGELOG_MANUAL.sql status to: ✅ EXECUTED
-- [ ] Test: Can create community, join, promote admin, upload avatar
-- [ ] Commit changes to git
-- =====================================================
