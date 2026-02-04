# RBAC Setup Instructions

## System Administrator Setup

### Initial Setup (One-time)

After running the `20260120000000_app_admins.sql` migration, you need to manually add yourself as the first system administrator.

1. **Get your user UUID:**
   - Log into your app
   - Go to Supabase Dashboard → Authentication → Users
   - Find your user and copy the UUID

2. **Add yourself as system admin:**

   ```sql
   insert into public.app_admins(user_id)
   values ('your-user-uuid-here');
   ```

3. **Verify:**
   ```sql
   select * from public.app_admins;
   ```

### Adding Additional Admins

Once you are a system admin, you can add other admins via the Supabase Dashboard:

```sql
insert into public.app_admins(user_id)
values ('another-user-uuid');
```

Or remove admins:

```sql
delete from public.app_admins
where user_id = 'user-uuid-to-remove';
```

## Role Hierarchy

### System Admin

- Can CRUD all content (posts, news_items, communities, community_members)
- Can manage other system admins
- Bypasses all RLS policies via admin-specific policies

### Community Owner/Admin

- **Owner:** Created the community, can assign admin role, full community control
- **Admin:** Can post as community, manage community content
- Both can see community in ActorSelector when creating news

### Community Member

- Can view community content
- Cannot post as community
- Will not see community in ActorSelector

### Regular User

- Can CRUD their own content
- Must be promoted to owner/admin by community owner to manage community content

## App Behavior

### News Creation

- ActorSelector shows:
  - User's own identity (always available)
  - Communities where user is owner or admin
  - Role label (ejer/admin) displayed next to each community

### Post Creation

- Currently: Posts are always created as the user themselves
- Community posting for posts is not yet implemented
- Info message displayed: "Community-posting for opslag kommer snart"

### RLS Security

- All tables protected by Row-Level Security
- System admins have bypass policies with clear naming:
  - `system_admin_full_access_news_items`
  - `system_admin_update_communities`
  - `system_admin_delete_communities`
  - `system_admin_insert_community_members`
  - `system_admin_update_community_members`
  - `system_admin_delete_community_members`

## Migration Safety

The `20260120000000_app_admins.sql` migration is:

- ✅ Idempotent (can be run multiple times safely)
- ✅ Additive only (no existing tables/columns modified)
- ✅ Non-breaking (existing functionality unchanged)
- ✅ Uses `drop policy if exists` before creating policies

## Testing

After setup:

1. **Verify system admin:**

   ```typescript
   import { isSystemAdmin } from './src/services/rbac';
   const isAdmin = await isSystemAdmin();
   console.log('Is system admin:', isAdmin); // Should be true
   ```

2. **Verify community roles:**

   ```typescript
   import { getMyCommunityRoles } from './src/services/rbac';
   const roles = await getMyCommunityRoles();
   console.log('My community roles:', roles);
   // Example output: { 'uuid-1': 'owner', 'uuid-2': 'admin' }
   ```

3. **Test news creation as community:**
   - Open app → Plus button → Del nyhed
   - Should see communities where you're owner/admin in ActorSelector
   - Select community → Add URL → Del nyhed
   - Verify news appears with community name in feed
