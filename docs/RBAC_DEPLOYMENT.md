# RBAC Implementation - Deployment Checklist

## ✅ Implementation Complete

All RBAC features have been implemented following the requirements:
- ✅ Additive changes only (no breaking changes)
- ✅ Posts table and queries untouched
- ✅ System admin role with full access
- ✅ Community owner/admin roles with proper filtering
- ✅ TypeScript compilation successful (0 errors)

## 📋 Deployment Steps

### Step 1: Run Database Migration

**File:** `supabase/migrations/20260120000000_app_admins.sql`

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the entire migration file
4. Execute the SQL

**What it does:**
- Creates `app_admins` table with RLS
- Adds admin bypass policies for:
  - `news_items` (full access)
  - `communities` (update/delete)
  - `community_members` (insert/update/delete)

### Step 2: Seed First System Admin

1. Get your user UUID from Supabase Dashboard → Authentication → Users
2. Run in SQL Editor:
   ```sql
   insert into public.app_admins(user_id) 
   values ('YOUR-USER-UUID-HERE');
   ```
3. Verify:
   ```sql
   select * from public.app_admins;
   ```

### Step 3: Test in App

1. **Rebuild app:**
   ```bash
   npm start
   # Or restart Expo Go
   ```

2. **Test system admin check:**
   - Log into app as the user you added
   - System should recognize you as admin (for future admin UI)

3. **Test community roles:**
   - Tap Plus button
   - Tap "Del nyhed"
   - Verify ActorSelector shows only communities where you're owner/admin
   - Each community should display role label (ejer/admin)

4. **Test post flow (unchanged):**
   - Tap Plus button
   - Tap "Opret opslag"
   - Should see info message about community posting coming later
   - Create post as normal (with/without image)
   - Verify post appears in feed

5. **Test news creation as community:**
   - Tap Plus button → Del nyhed
   - Select a community from ActorSelector
   - Enter URL → Del nyhed
   - Verify news appears with community name (not "Ukendt")

## 🔍 Files Changed

### New Files
1. **supabase/migrations/20260120000000_app_admins.sql**
   - App admins table + RLS + bypass policies

2. **src/services/rbac.ts**
   - `isSystemAdmin()` - Check if user is system admin
   - `getMyCommunityRoles()` - Get user's roles in all communities
   - `canPostAsCommunity(role)` - Check if role allows posting
   - `canManageCommunity(role)` - Check if role allows management
   - `canAssignAdmin(role)` - Check if role allows promoting to admin

3. **docs/RBAC_SETUP.md**
   - Complete setup and testing instructions

4. **docs/RBAC_DEPLOYMENT.md** (this file)
   - Deployment checklist

### Modified Files
1. **src/components/ActorSelector.tsx**
   - Now uses `getMyCommunityRoles()` from rbac.ts
   - Filters to show only owner/admin communities
   - Displays role labels (ejer/admin)
   - No longer depends on profileApi's fetchMyCommunities

2. **src/screens/CreateSheet.tsx**
   - Added info message for post composer
   - Kept post flow completely unchanged
   - News flow uses ActorSelector (as before)

## ⚠️ Important Notes

### What Was NOT Changed
- ❌ `posts` table schema
- ❌ Post creation queries
- ❌ Post upload flow
- ❌ PostComposer logic
- ❌ Post RLS policies
- ❌ Any existing table columns

### Migration Safety
- Idempotent: Can be run multiple times safely
- Uses `if not exists` for table creation
- Uses `drop policy if exists` before creating policies
- No data loss risk

### RLS Behavior
- System admins bypass all restrictions via new policies
- Community owner/admin can post as community (news only for now)
- Regular users unchanged
- All existing policies remain active

## 🚀 Next Steps (Future Work)

These are NOT part of current implementation:

1. **Migrate posts to actor model:**
   - Add `actor_type`, `actor_id` columns to posts
   - Update PostComposer to use ActorSelector
   - Migrate existing posts data
   - Update RLS policies

2. **Admin UI:**
   - System admin dashboard
   - User management
   - Community moderation

3. **Owner can assign admin:**
   - UI to promote members to admin
   - Uses `canAssignAdmin(role)` function

## ✅ Verification Checklist

Before considering deployment complete:

- [ ] Migration executed successfully in Supabase
- [ ] First system admin seeded
- [ ] `select * from app_admins` returns your user
- [ ] App builds without TypeScript errors
- [ ] ActorSelector shows communities with role labels
- [ ] Can create news as community (with correct author name)
- [ ] Can create post as self (unchanged behavior)
- [ ] Info message appears on post creation screen
- [ ] Existing posts still display correctly
- [ ] No console errors related to RBAC

## 📞 Troubleshooting

### ActorSelector shows no communities
1. Check if you're actually owner/admin:
   ```sql
   select community_id, role 
   from community_members 
   where user_id = 'YOUR-UUID';
   ```
2. Verify communities exist:
   ```sql
   select id, name from communities;
   ```

### System admin check returns false
1. Verify admin was seeded:
   ```sql
   select * from app_admins;
   ```
2. Check RLS is enabled:
   ```sql
   select tablename, rowsecurity 
   from pg_tables 
   where schemaname = 'public' and tablename = 'app_admins';
   ```

### Posts broken after deployment
This should NOT happen (posts untouched), but if it does:
1. Check console for errors
2. Verify `posts` table unchanged:
   ```sql
   \d posts
   ```
3. Rollback migration if needed (drop app_admins table)
