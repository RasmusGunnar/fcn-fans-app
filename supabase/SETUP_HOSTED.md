# Hosted Supabase Setup Guide

## ⚠️ Important: No Docker/Local CLI

This project uses **manual database management** for hosted Supabase instances.

**Do NOT run these commands on hosted:**

- ❌ `npx supabase db push`
- ❌ `npx supabase db pull`
- ❌ `npx supabase migration new`

These commands are only for local development with Docker (not yet set up).

## 📋 Workflow for Database Changes

### 1. Make Changes in Supabase Dashboard

All database changes are executed manually via:
**Supabase Dashboard → SQL Editor**

### 2. Document Changes

After executing SQL:

1. Copy the SQL code
2. Paste into `supabase/CHANGELOG_MANUAL.sql`
3. Add date, purpose, status
4. Commit to git

### 3. Verify Changes

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public';

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

## 🗄️ Initial Database Setup

### Step 1: Database Already Provisioned

**✅ Hosted database is already set up and running.**

**❌ DO NOT re-run old migrations on hosted:**

- Migration files in `supabase/migrations/` are **legacy reference only**
- Database was already provisioned manually
- Re-running them may cause conflicts or errors

**For new database changes:**

- Execute SQL directly via **Dashboard → SQL Editor**
- Document all changes in `supabase/CHANGELOG_MANUAL.sql`
- Commit to git for version control

**Migration files are kept for:**

- Understanding database schema evolution
- Reference when making new changes
- Future local development setup (when Docker is configured)

### Step 2: Storage Buckets (Manual Setup)

Navigate to **Dashboard → Storage** and create:

#### post-media Bucket

- **Name:** `post-media`
- **Public:** ✅ Yes
- **File size limit:** 10MB (or desired)
- **Allowed MIME types:** (leave empty or restrict to images/videos)

#### avatars Bucket

- **Name:** `avatars`
- **Public:** ✅ Yes
- **File size limit:** 5MB
- **Allowed MIME types:** `image/jpeg`, `image/png`

### Step 3: Storage Policies (Manual Setup)

Navigate to **Dashboard → Storage → [bucket name] → Policies**

**Note:** When creating policies in Dashboard:

1. Click "New Policy"
2. Select operation (SELECT, INSERT, UPDATE, DELETE)
3. Select target role (public, authenticated, etc.)
4. Paste **only the expression** (the part after `USING` or `WITH CHECK`) from examples below

#### post-media Policies

**Policy: Allow authenticated upload to own folder**

```sql
bucket_id = 'post-media'
AND auth.role() = 'authenticated'
AND (storage.foldername(name))[1] = auth.uid()::text
```

- Operation: INSERT
- Target roles: authenticated

**Policy: Allow public read**

```sql
bucket_id = 'post-media'
```

- Operation: SELECT
- Target roles: public

#### avatars Policies

**Policy: Users can upload their own avatar**

```sql
bucket_id = 'avatars'
AND name = auth.uid()::text || '.jpg'
```

- Operation: INSERT
- Target roles: authenticated

**Policy: Public avatar access**

```sql
bucket_id = 'avatars'
```

- Operation: SELECT
- Target roles: public

**Policy: Users can update their own avatar**

```sql
bucket_id = 'avatars'
AND name = auth.uid()::text || '.jpg'
```

- Operation: UPDATE
- Target roles: authenticated

**Policy: Users can delete their own avatar**

```sql
bucket_id = 'avatars'
AND name = auth.uid()::text || '.jpg'
```

- Operation: DELETE
- Target roles: authenticated

### Step 4: Seed System Admin

1. Get your user UUID:
   - Dashboard → Authentication → Users
   - Copy your UUID

2. Run in SQL Editor:

   ```sql
   insert into public.app_admins(user_id)
   values ('your-user-uuid-here');
   ```

3. Verify:
   ```sql
   select * from public.app_admins;
   ```

### Step 5: Deploy Edge Functions

```bash
npx supabase functions deploy parse-link --no-verify-jwt
npx supabase functions deploy get_next_fixture
npx supabase functions deploy send-push
npx supabase functions deploy sync_fcn_fixtures
```

## ✅ Setup Checklist

Before testing the app:

- [ ] Ran all migration files in SQL Editor (in order)
- [ ] Created `post-media` bucket (public)
- [ ] Created `avatars` bucket (public, 5MB limit)
- [ ] Created storage policies for post-media (2 policies)
- [ ] Created storage policies for avatars (4 policies)
- [ ] Seeded first system admin user
- [ ] Verified app_admins table has your user
- [ ] Deployed all Edge Functions
- [ ] Tested image upload in app
- [ ] Tested avatar upload in app
- [ ] Tested news creation as community

## 📝 Making New Database Changes

### Process

1. **Plan the change:**
   - Write SQL locally
   - Make it idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`)
   - Test logic carefully

2. **Execute in Dashboard:**
   - Dashboard → SQL Editor
   - Paste SQL
   - Run and verify

3. **Document in git:**
   - Copy SQL to `supabase/CHANGELOG_MANUAL.sql`
   - Add date, purpose, status
   - Commit changes

4. **Communicate:**
   - If working in a team, notify others
   - Include in PR description

### Example: Adding a New Column

```sql
-- =====================================================
-- 2026-01-XX: Add bio to profiles
-- =====================================================
-- Purpose: Allow users to add profile bio
-- Status: ✅ EXECUTED
-- =====================================================

alter table public.profiles
  add column if not exists bio text;
```

### Example: Adding a New Policy

```sql
-- =====================================================
-- 2026-01-XX: Allow users to update own profile
-- =====================================================
-- Purpose: Users can edit display_name and bio
-- Status: ✅ EXECUTED
-- =====================================================

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

## 🚫 Do Not Use (Until Docker Setup)

These commands are **not compatible** with hosted Supabase without local Docker:

```bash
# ❌ DO NOT RUN
npx supabase db push
npx supabase db pull
npx supabase db diff
npx supabase migration new
npx supabase db reset
```

Instead, use the helper script:

```bash
npm run db:hosted
# Outputs: "Use Supabase SQL Editor + CHANGELOG_MANUAL.sql"
```

## 🐳 Future: Local Development with Docker

When Docker setup is complete, you'll be able to:

- Run local Supabase instance
- Use `supabase db push/pull` safely
- Generate migrations with `supabase migration new`
- Test changes locally before deploying

Until then, manual SQL Editor workflow is the safest approach.

## 🔧 Troubleshooting

### "Policy already exists"

- This is expected if re-running SQL
- All policies use `DROP ... IF EXISTS` before creating
- Safe to ignore

### "Insufficient privilege" on storage.objects

- This is expected on hosted Supabase
- Create storage policies via Dashboard UI (see Step 3)

### Migration files changed but database unchanged

- Remember: Don't use `db push` on hosted
- Run SQL manually in Dashboard
- Update `CHANGELOG_MANUAL.sql`

### Edge Function deployment fails

- Check you're logged in: `npx supabase login`
- Verify project linked: `npx supabase link --project-ref YOUR-REF`
- Edge Functions work independently of database migrations

## 📚 Related Documentation

- [CHANGELOG_MANUAL.sql](CHANGELOG_MANUAL.sql) - All executed DB changes
- [RBAC_SETUP.md](../docs/RBAC_SETUP.md) - Role-based access control
- [RBAC_DEPLOYMENT.md](../docs/RBAC_DEPLOYMENT.md) - RBAC deployment guide
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Original setup guide (legacy)

## 🆘 Need Help?

If you encounter issues:

1. Check Supabase Dashboard logs
2. Verify RLS policies in Dashboard → Database → Policies
3. Test queries directly in SQL Editor
4. Check app console logs for detailed errors
5. Refer to `CHANGELOG_MANUAL.sql` for executed changes
