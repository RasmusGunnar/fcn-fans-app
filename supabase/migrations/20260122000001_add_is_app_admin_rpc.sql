-- RPC function to check if current user is an app admin
-- This bypasses RLS and should be callable by any authenticated user
-- Returns: true if user is admin, false otherwise

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if current user exists in app_admins table
  RETURN EXISTS (
    SELECT 1
    FROM public.app_admins
    WHERE user_id = auth.uid()
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Optional: Add comment for documentation
COMMENT ON FUNCTION public.is_app_admin() IS 'Returns true if the current authenticated user is an app admin. Uses SECURITY DEFINER to bypass RLS.';
