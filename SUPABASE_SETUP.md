# Supabase Setup Guide

This document provides manual setup steps for Supabase hosted instances, as some features cannot be automated via SQL migrations.

## Storage Buckets Setup

⚠️ **Important:** The `storage.create_bucket()` function is not available on hosted Supabase instances. You must create storage buckets manually through the Supabase Dashboard.

### Required Buckets

Navigate to **Supabase Dashboard → Storage** and create the following buckets:

#### 1. post-media (Public)

- **Name:** `post-media`
- **Public bucket:** ✅ Yes (enabled)
- **File size limit:** Default or custom (e.g., 10MB)
- **Allowed MIME types:** (leave empty for all types, or restrict to images/videos)
- **Purpose:** Stores user-uploaded photos and videos for posts

**Storage Policies** (may require manual setup on hosted):

- ✅ Authenticated users can upload to their own folder (`userId/*` prefix)
- ✅ Public read access for all files

**Note:** On hosted Supabase, if migrations show "No permission to alter storage.objects", you must create policies manually (see Storage Policies section below).

#### 2. avatars (Public)

- **Name:** `avatars`
- **Public bucket:** ✅ Yes (enabled)
- **File size limit:** 5MB (5242880 bytes)
- **Allowed MIME types:** `image/jpeg`, `image/png`
- **Purpose:** Stores user profile avatar images

**Storage Policies** (may require manual setup on hosted):

- ✅ Authenticated users can upload their own avatar (`{user_id}.jpg`)
- ✅ Public read access for all avatars
- ✅ Users can update/delete their own avatar

**Note:** On hosted Supabase, if migrations show "No permission for storage.objects policies", you must create policies manually (see Storage Policies section below).

### Verification Steps

After creating the buckets, verify the setup:

1. **Check bucket creation:**

   ```sql
   SELECT id, name, public, file_size_limit, allowed_mime_types
   FROM storage.buckets
   WHERE id IN ('post-media', 'avatars');
   ```

2. **Check RLS policies:**

   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
   FROM pg_policies
   WHERE tablename = 'objects'
   ORDER BY policyname;
   ```

3. **Test upload in app:**
   - Create a post with an image → should upload to `post-media/{user_id}/...`
   - Upload avatar → should upload to `avatars/{user_id}.jpg`

## Storage Policies (Hosted Instances)

⚠️ **Important:** On hosted Supabase instances, you typically don't have permission to manage `storage.objects` policies via SQL. If your migrations show notices like "No permission to alter storage.objects", you must create storage policies manually through the Dashboard.

### Manual Policy Setup

Navigate to **Supabase Dashboard → Storage → [bucket name] → Policies**

#### post-media Bucket Policies

**Policy 1: Allow authenticated upload to own folder**

- **Operation:** INSERT
- **Target roles:** authenticated
- **Policy definition:**
  ```sql
  bucket_id = 'post-media'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
  ```
- **Purpose:** Users can only upload to their own folder (`post-media/{user_id}/...`)

**Policy 2: Allow public read post-media**

- **Operation:** SELECT
- **Target roles:** public
- **Policy definition:**
  ```sql
  bucket_id = 'post-media'
  ```
- **Purpose:** Anyone can view/download files from post-media bucket

#### avatars Bucket Policies

**Policy 1: Users can upload their own avatar**

- **Operation:** INSERT
- **Target roles:** authenticated
- **Policy definition:**
  ```sql
  bucket_id = 'avatars'
  AND name = auth.uid()::text || '.jpg'
  ```
- **Purpose:** Users can upload their avatar as `{user_id}.jpg`

**Policy 2: Public avatar access**

- **Operation:** SELECT
- **Target roles:** public
- **Policy definition:**
  ```sql
  bucket_id = 'avatars'
  ```
- **Purpose:** Anyone can view avatar images

**Policy 3: Users can update their own avatar**

- **Operation:** UPDATE
- **Target roles:** authenticated
- **Policy definition:**
  ```sql
  bucket_id = 'avatars'
  AND name = auth.uid()::text || '.jpg'
  ```
- **Purpose:** Users can replace their existing avatar

**Policy 4: Users can delete their own avatar**

- **Operation:** DELETE
- **Target roles:** authenticated
- **Policy definition:**
  ```sql
  bucket_id = 'avatars'
  AND name = auth.uid()::text || '.jpg'
  ```
- **Purpose:** Users can remove their avatar

### Verification

After creating policies manually:

1. **Check policies exist:**

   ```sql
   SELECT policyname, cmd, roles
   FROM pg_policies
   WHERE tablename = 'objects'
   AND policyname LIKE '%avatar%' OR policyname LIKE '%post-media%'
   ORDER BY policyname;
   ```

2. **Test in app:**
   - Upload post image → should succeed
   - Upload avatar → should succeed
   - Try to upload to another user's folder → should fail (permission denied)

## Migrations Compatibility

The following migrations have been updated to be **hosted-safe**:

### ✅ 20260115_init_media.sql

- Attempts to create `post-media` bucket if `storage.create_bucket()` exists
- Attempts to enable RLS and create policies on `storage.objects` (wrapped in exception handling)
- Falls back to RAISE NOTICE with manual instructions if permissions denied
- All other SQL (tables, policies) runs normally

### ✅ 20260117_create_avatars_bucket.sql

- Attempts to INSERT into `storage.buckets` if permissions allow
- Attempts to create policies on `storage.objects` (wrapped in exception handling)
- Falls back to RAISE NOTICE with manual instructions if permissions denied
- All RLS policies have exception handling for hosted compatibility

### ✅ cleanup_avatar_policies.sql

- Attempts to drop old policies (wrapped in exception handling)
- Safe to run on hosted instances (will show notice if permissions denied)

### Migration Behavior

**On self-hosted/local Supabase:**

- Buckets created automatically via SQL ✅
- Storage policies created automatically ✅

**On hosted Supabase:**

- SQL notices displayed for bucket/policy creation
- Migrations will NOT fail (exception handling prevents errors) ✅
- **Action required:**
  1. Create buckets manually (see Required Buckets section)
  2. Create storage policies manually (see Storage Policies section)
  3. Verify all other database features work normally

## Database Migrations

Run all migrations using:

```bash
npx supabase db push
```

Or in Supabase Dashboard → SQL Editor, execute each migration file in order:

1. `20260115_init_media.sql`
2. `20260116_add_profile_features.sql`
3. `20260116_create_events_module.sql`
4. `20260116_create_fixtures.sql`
5. `20260117_add_bus_trip_fields.sql`
6. `20260117_create_avatars_bucket.sql`
7. `20260119_create_news_items.sql`
8. `20260120000000_app_admins.sql`
9. `cleanup_avatar_policies.sql` (if needed)

## Edge Functions

Deploy Edge Functions separately:

```bash
npx supabase functions deploy parse-link
npx supabase functions deploy get_next_fixture
npx supabase functions deploy send-push
npx supabase functions deploy sync_fcn_fixtures
```

## RBAC Setup

See [RBAC_SETUP.md](docs/RBAC_SETUP.md) for system admin and role-based access control setup.

## Troubleshooting

### "must be owner of table objects" or "insufficient_privilege"

✅ **Expected on hosted Supabase.** The migrations are designed to handle this gracefully:

1. Check migration output for NOTICE messages
2. Create storage buckets manually in Dashboard → Storage
3. Create storage policies manually in Dashboard → Storage → [bucket] → Policies
4. All other database features (tables, functions, etc.) should work normally

### "storage.create_bucket does not exist"

✅ **Expected on hosted Supabase.** Create buckets manually in Dashboard → Storage.

### "relation 'storage.buckets' does not exist"

✅ **Expected on hosted Supabase.** Use Dashboard UI instead of SQL INSERT.

### Images not uploading

1. Verify buckets exist in Dashboard → Storage
2. Check bucket is set to **public**
3. Verify RLS policies applied:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'objects';
   ```

### Policies not working

1. Ensure `row level security` is enabled:
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'storage' AND tablename = 'objects';
   ```
2. Re-run migration with RLS policy creation

## Summary Checklist

Before testing the app:

- [ ] Created `post-media` bucket (public, no size limit)
- [ ] Created `avatars` bucket (public, 5MB limit, JPEG/PNG only)
- [ ] Created storage policies manually (if on hosted - see Storage Policies section)
- [ ] Ran all database migrations (`npx supabase db push`)
- [ ] Verified migrations completed without fatal errors (notices are OK)
- [ ] Deployed Edge Functions
- [ ] Seeded first system admin (see RBAC_SETUP.md)
- [ ] Verified buckets in Dashboard → Storage
- [ ] Verified policies in Dashboard → Storage → [bucket] → Policies
- [ ] Tested image upload in app
- [ ] Tested avatar upload in app

---

**Need help?** Check the Supabase Storage documentation:
https://supabase.com/docs/guides/storage
