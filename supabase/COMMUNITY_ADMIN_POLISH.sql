-- ============================================
-- COMMUNITY ADMIN POLISH MIGRATION
-- ============================================
-- This migration supports the community admin polish feature:
-- - Ensures location_label column exists in communities table
-- - Adds RLS policy for owner-only role updates

-- Note: Run these commands in Supabase Dashboard > SQL Editor if needed

-- 1. Ensure location_label column exists (may already exist)
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM information_schema.columns 
--     WHERE table_name = 'communities' AND column_name = 'location_label'
--   ) THEN
--     ALTER TABLE communities ADD COLUMN location_label TEXT;
--   END IF;
-- END $$;

-- 2. Update RLS policy for community_members to allow owner to update roles
-- Drop existing policy if it exists and recreate
DROP POLICY IF EXISTS "Owners can update member roles" ON community_members;

CREATE POLICY "Owners can update member roles"
ON community_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = community_members.community_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
);

-- 3. Ensure owners/admins can update community details
DROP POLICY IF EXISTS "Owners and admins can update community" ON communities;

CREATE POLICY "Owners and admins can update community"
ON communities
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM community_members cm
    WHERE cm.community_id = communities.id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
  )
);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Check if policies are created:
-- SELECT * FROM pg_policies WHERE tablename IN ('communities', 'community_members');

-- Check if location_label column exists:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'communities' AND column_name = 'location_label';
