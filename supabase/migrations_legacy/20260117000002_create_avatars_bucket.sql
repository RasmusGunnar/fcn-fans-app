-- Create avatars bucket
-- Note: INSERT into storage.buckets may not work on hosted Supabase instances
-- Create bucket manually in Supabase Dashboard → Storage if needed
DO $$
BEGIN
  -- Try to insert bucket using INSERT (works on some self-hosted)
  BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'avatars',
      'avatars',
      true,
      5242880, -- 5MB in bytes
      ARRAY['image/jpeg', 'image/png']
    )
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'Created storage bucket: avatars';
  EXCEPTION
    WHEN insufficient_privilege OR undefined_table THEN
      RAISE NOTICE 'Cannot create bucket via SQL; create bucket manually in dashboard: avatars (public, 5MB limit, image/jpeg and image/png allowed)';
  END;
END $$;

-- Drop existing policies if they exist (wrapped for hosted safety)
-- Note: On hosted Supabase, you may not have permission to manage storage.objects policies
-- Configure manually via Dashboard → Storage → Policies if needed
DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Public avatar access" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects';
    RAISE NOTICE 'Dropped existing avatar policies (if any)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission to drop storage.objects policies - will attempt to create';
  END;
END $$;

-- Allow authenticated users to upload their own avatar (avatars/USER_ID.jpg)
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = ''avatars'' 
        AND name = auth.uid()::text || ''.jpg''
      )';
    RAISE NOTICE 'Created policy: Users can upload their own avatar';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → avatars → Policies:
      - Name: Users can upload their own avatar
      - Policy: INSERT for authenticated
      - Check: bucket_id = ''avatars'' AND name = auth.uid()::text || ''.jpg''';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can upload their own avatar" already exists';
  END;
END $$;

-- Allow public read access
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Public avatar access"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = ''avatars'')';
    RAISE NOTICE 'Created policy: Public avatar access';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → avatars → Policies:
      - Name: Public avatar access
      - Policy: SELECT for public
      - Using: bucket_id = ''avatars''';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Public avatar access" already exists';
  END;
END $$;

-- Allow users to update their own avatar
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Users can update their own avatar"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = ''avatars'' 
        AND name = auth.uid()::text || ''.jpg''
      )';
    RAISE NOTICE 'Created policy: Users can update their own avatar';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → avatars → Policies:
      - Name: Users can update their own avatar
      - Policy: UPDATE for authenticated
      - Using: bucket_id = ''avatars'' AND name = auth.uid()::text || ''.jpg''';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can update their own avatar" already exists';
  END;
END $$;

-- Allow users to delete their own avatar
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Users can delete their own avatar"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = ''avatars'' 
        AND name = auth.uid()::text || ''.jpg''
      )';
    RAISE NOTICE 'Created policy: Users can delete their own avatar';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → avatars → Policies:
      - Name: Users can delete their own avatar
      - Policy: DELETE for authenticated
      - Using: bucket_id = ''avatars'' AND name = auth.uid()::text || ''.jpg''';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can delete their own avatar" already exists';
  END;
END $$;
