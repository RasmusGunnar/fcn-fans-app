-- =====================================================
-- Admin delete community function
-- =====================================================
-- Purpose: Allow app admins to delete communities and all related data.
-- Cascading deletes are handled by foreign key constraints.
-- =====================================================

CREATE OR REPLACE FUNCTION public.delete_community_as_admin(p_community_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.communities
  WHERE id = p_community_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community_as_admin(uuid) TO authenticated;
