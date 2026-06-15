-- Storage bucket for post media (public for MVP)
-- Note: storage.create_bucket() is not available on hosted Supabase instances
-- Create bucket manually in Supabase Dashboard → Storage if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage' AND p.proname = 'create_bucket'
  ) THEN
    PERFORM storage.create_bucket('post-media', public => true);
    RAISE NOTICE 'Created storage bucket: post-media';
  ELSE
    RAISE NOTICE 'storage.create_bucket not available; create bucket manually in dashboard: post-media (public)';
  END IF;
END $$;

-- Storage RLS: allow authenticated users to upload to their own folder (userId/* prefix)
-- Note: On hosted Supabase, you don't have permission to alter storage.objects
-- Configure storage policies manually via Dashboard → Storage → Policies
DO $$
BEGIN
  BEGIN
    EXECUTE 'alter table storage.objects enable row level security';
    RAISE NOTICE 'Enabled RLS on storage.objects';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission to alter storage.objects. Configure via Dashboard → Storage → Policies';
  END;
END $$;

-- Policy: Authenticated users can upload to their own folder (post-media/userId/*)
DO $$
BEGIN
  BEGIN
    EXECUTE 'drop policy if exists "allow authenticated upload to own folder" on storage.objects';
    EXECUTE 'create policy "allow authenticated upload to own folder" on storage.objects
      for insert with check (
        bucket_id = ''post-media'' 
        and auth.role() = ''authenticated''
        and (storage.foldername(name))[1] = auth.uid()::text
      )';
    RAISE NOTICE 'Created policy: allow authenticated upload to own folder';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → post-media → Policies:
      - Name: allow authenticated upload to own folder
      - Policy: INSERT for authenticated users
      - Check: bucket_id = ''post-media'' AND (storage.foldername(name))[1] = auth.uid()::text';
  END;
END $$;

-- Policy: Public read access for post-media bucket
DO $$
BEGIN
  BEGIN
    EXECUTE 'drop policy if exists "allow public read post-media" on storage.objects';
    EXECUTE 'create policy "allow public read post-media" on storage.objects
      for select using (
        bucket_id = ''post-media''
      )';
    RAISE NOTICE 'Created policy: allow public read post-media';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No permission for storage.objects policies. Create manually in Dashboard → Storage → post-media → Policies:
      - Name: allow public read post-media
      - Policy: SELECT for public users
      - Using: bucket_id = ''post-media''';
  END;
END $$;

-- Profiles table (extend public schema to store expo push token)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text,
  updated_at timestamp with time zone default now()
);

-- Posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamp with time zone default now(),
  media jsonb not null default '[]'::jsonb
);

-- Comments table
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamp with time zone default now()
);

-- RLS policies
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "read all posts" on public.posts;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "read all posts" on public.posts for select using (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "read all posts" already exists, skipping';
  END;
END $$;

drop policy if exists "insert own posts" on public.posts;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "insert own posts" on public.posts for insert with check (auth.uid() = author_id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "insert own posts" already exists, skipping';
  END;
END $$;

drop policy if exists "read all comments" on public.comments;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "read all comments" on public.comments for select using (true)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "read all comments" already exists, skipping';
  END;
END $$;

drop policy if exists "insert own comments" on public.comments;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "insert own comments" on public.comments for insert with check (auth.uid() = author_id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "insert own comments" already exists, skipping';
  END;
END $$;

drop policy if exists "read own profile" on public.profiles;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "read own profile" on public.profiles for select using (auth.uid() = id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "read own profile" already exists, skipping';
  END;
END $$;

drop policy if exists "upsert own token" on public.profiles;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "upsert own token" on public.profiles for insert with check (auth.uid() = id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "upsert own token" already exists, skipping';
  END;
END $$;

drop policy if exists "update own token" on public.profiles;
DO $$
BEGIN
  BEGIN
    EXECUTE 'create policy "update own token" on public.profiles for update using (auth.uid() = id)';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'policy "update own token" already exists, skipping';
  END;
END $$;
