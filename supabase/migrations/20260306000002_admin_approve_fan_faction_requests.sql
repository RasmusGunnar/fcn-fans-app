-- =====================================================
-- Admin approve/reject fan faction requests
-- =====================================================
-- Purpose: allow app admins to process pending requests and,
-- on approval, atomically update communities.type.
-- =====================================================

CREATE OR REPLACE FUNCTION public.approve_fan_faction_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.community_fan_faction_requests
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING community_id INTO v_community_id;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  UPDATE public.communities
  SET type = 'fan_faction'
  WHERE id = v_community_id;

  RETURN v_community_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_fan_faction_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.community_fan_faction_requests
  SET
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING community_id INTO v_community_id;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN v_community_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_fan_faction_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_fan_faction_request(uuid) TO authenticated;
