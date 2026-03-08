-- =====================================================
-- Community fan faction requests
-- =====================================================
-- Purpose: allow community managers to request conversion
-- from community -> fan_faction, with admin review workflow.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.community_fan_faction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  note text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_fan_faction_requests_pending_unique
  ON public.community_fan_faction_requests (community_id)
  WHERE status = 'pending';

ALTER TABLE public.community_fan_faction_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_fan_faction_requests_select_authenticated" ON public.community_fan_faction_requests;
CREATE POLICY "community_fan_faction_requests_select_authenticated"
  ON public.community_fan_faction_requests
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "community_fan_faction_requests_insert_self" ON public.community_fan_faction_requests;
CREATE POLICY "community_fan_faction_requests_insert_self"
  ON public.community_fan_faction_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "community_fan_faction_requests_update_admin" ON public.community_fan_faction_requests;
CREATE POLICY "community_fan_faction_requests_update_admin"
  ON public.community_fan_faction_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
