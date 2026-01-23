-- Clean up existing avatar policies
-- Note: On hosted Supabase, you may not have permission to manage storage.objects policies
-- This migration is safe to run but may produce notices on hosted instances
DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Public avatar access" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects';
    RAISE NOTICE 'Cleaned up avatar policies';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission to drop storage.objects policies. If needed, remove manually via Dashboard → Storage → avatars → Policies';
  END;
END $$;
