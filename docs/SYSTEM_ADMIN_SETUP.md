# System Admin Detection - Implementation Guide

## 📋 Oversigt

Global system admin detection er implementeret via:
1. ✅ Supabase RPC funktion `is_app_admin()`
2. ✅ Global state i `AuthProvider`
3. ✅ Eksponeret via `useAuth()` hook
4. ✅ Integreret i alle permissions checks
5. ✅ UI komponenter respekterer admin status

## 🔍 Hvor Auth State Håndteres

**Lokation:** [src/auth/AuthProvider.tsx](../src/auth/AuthProvider.tsx)

Dette er det centrale sted hvor:
- Supabase session håndteres
- User state administreres
- Admin status hentes og caches
- Auth context eksponeres til hele appen

### Auth Flow
```typescript
1. App starter → AuthProvider loader
2. getSession() → sætter user/session
3. onAuthStateChange() → lytter til ændringer
4. Når user findes → kald is_app_admin() RPC
5. isAppAdmin state opdateres
6. Alle komponenter får adgang via useAuth()
```

## 🛠️ Implementation Details

### Del 1: Supabase RPC Function

**Fil:** [supabase/migrations_legacy/20260122000001_add_is_app_admin_rpc.sql](../supabase/migrations_legacy/20260122000001_add_is_app_admin_rpc.sql)

```sql
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.app_admins
    WHERE user_id = auth.uid()
  );
END;
$$;
```

**Hvorfor RPC?**
- ✅ Bypasser RLS restrictions
- ✅ `SECURITY DEFINER` giver funktionen elevated privileges
- ✅ Sikker måde at tjekke admin status på
- ✅ Hurtigere end join queries

**Deploy til Supabase:**
```bash
# Via Supabase CLI
supabase db push

# Eller via Dashboard
# Kopiér SQL til SQL Editor og kør
```

### Del 2: AuthProvider Implementation

**Fil:** [src/auth/AuthProvider.tsx](../src/auth/AuthProvider.tsx)

**Tilføjede felter til context:**
```typescript
type AuthContextValue = {
  // ... existing fields
  isAppAdmin: boolean;  // ✅ NEW
};
```

**Admin check logic:**
```typescript
useEffect(() => {
  let mounted = true;

  const checkAdminStatus = async (userId: string) => {
    try {
      // Use RPC to bypass RLS
      const { data: isAdmin, error } = await supabase.rpc('is_app_admin');
      
      if (error) throw error;
      
      if (mounted) {
        setIsAppAdmin(!!isAdmin);
        if (__DEV__) {
          console.log('[AuthProvider] Admin check result:', { 
            userId, 
            isAdmin: !!isAdmin 
          });
        }
      }
    } catch (e) {
      console.warn('[AuthProvider] Error checking admin status:', e);
      if (mounted) setIsAppAdmin(false);
    }
  };

  if (user?.id) {
    checkAdminStatus(user.id);
  } else {
    setIsAppAdmin(false);
  }

  return () => {
    mounted = false;
  };
}, [user?.id]);
```

**Nøgle features:**
- ✅ Kører automatisk ved session change
- ✅ Cleaner ved unmount (memory leak prevention)
- ✅ Sætter false hvis user er null
- ✅ Error handling med fallback til false
- ✅ Debug logging i development mode

### Del 3: Permissions Integration

**Fil:** [src/utils/permissions.ts](../src/utils/permissions.ts)

Alle permissions funktioner starter med admin bypass:

```typescript
export function canEditPost(
  userId: string | undefined,
  isAppAdmin: boolean,  // ✅ Parameter
  post: PostPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;  // ✅ FIRST CHECK
  if (!userId) return false;
  // ... rest of logic
}
```

**Implementeret i:**
- ✅ `canEditPost()`
- ✅ `canDeletePost()`
- ✅ `canEditComment()`
- ✅ `canDeleteComment()`
- ✅ `canEditEvent()`
- ✅ `canDeleteEvent()`

### Del 4: UI Integration

#### FanPostCard
**Fil:** [src/components/cards/FanPostCard.tsx](../src/components/cards/FanPostCard.tsx)

```typescript
const { user, isAppAdmin } = useAuth();  // ✅ Hent fra context

// Post menu
const showEditOption = canEditPost(user?.id, isAppAdmin, { author_id: post.authorId });
const showDeleteOption = canDeletePost(user?.id, isAppAdmin, { author_id: post.authorId });

// Comment delete visibility
const canDelete = c.author_id === user?.id || post.authorId === user?.id || isAppAdmin;
```

#### EventDetailsScreen
**Fil:** [src/screens/EventDetailsScreen.tsx](../src/screens/EventDetailsScreen.tsx)

```typescript
const { user, isAppAdmin } = useAuth();  // ✅ Hent fra context
const { role: communityRole } = useCommunityRole(event?.organizer_group_id);

const showEditOption = canEditEvent(
  user?.id,
  isAppAdmin,  // ✅ Passes til permission check
  { created_by: event.created_by, organizer_group_id: event.organizer_group_id },
  communityRole,
);
```

#### HomeScreen
**Fil:** [src/screens/HomeScreen.tsx](../src/screens/HomeScreen.tsx)

```typescript
const { user, isAppAdmin } = useAuth();

// Debug logging
if (__DEV__) {
  console.log('[HomeScreen]', { userId: user?.id, isAppAdmin });
}
```

## 🧪 Testing Guide

### 1. Setup Test Admin User

**I Supabase Dashboard eller via SQL:**
```sql
-- Find din user_id fra auth.users
SELECT id, email FROM auth.users;

-- Tilføj som admin
INSERT INTO public.app_admins (user_id) 
VALUES ('din-user-id-her');
```

### 2. Verificer RPC Function

**Test i Supabase SQL Editor:**
```sql
-- Som admin user
SELECT public.is_app_admin();
-- Skal returnere: true

-- Som non-admin user
SELECT public.is_app_admin();
-- Skal returnere: false
```

### 3. Test i App

**Start app og tjek console:**
```
[AuthProvider] Admin check result: { userId: '...', isAdmin: true }
[HomeScreen] { userId: '...', isAppAdmin: true }
```

**Verificer UI:**
- ✅ 3-prik menu vises på ALT indhold (også andres)
- ✅ Kan åbne edit screens for andres events
- ✅ Kan slette andres posts/comments
- ✅ Menu vises selv uden at være creator

### 4. Test Non-Admin User

**Log ind som almindelig bruger:**
```
[AuthProvider] Admin check result: { userId: '...', isAdmin: false }
[HomeScreen] { userId: '...', isAppAdmin: false }
```

**Verificer UI:**
- ✅ Ingen menu på andres indhold
- ✅ Kun menu på eget indhold
- ✅ Kan ikke slette andres posts

## 🐛 Troubleshooting

### Problem: isAppAdmin er altid false

**Løsning:**
1. Tjek at RPC function er deployed:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' AND routine_name = 'is_app_admin';
   ```

2. Tjek at user findes i app_admins:
   ```sql
   SELECT * FROM public.app_admins WHERE user_id = auth.uid();
   ```

3. Tjek console for errors:
   ```
   [AuthProvider] Error checking admin status: ...
   ```

### Problem: RPC function ikke fundet

**Løsning:**
```sql
-- Deploy manuelt via SQL Editor
-- Kopiér indhold fra migration file og kør
```

### Problem: Console viser ikke logs

**Løsning:**
```typescript
// Sikr at __DEV__ er true
console.log('__DEV__:', __DEV__);

// Eller tilføj midlertidig log uden __DEV__ guard
console.log('ADMIN DEBUG:', { user, isAppAdmin });
```

## 📊 Permission Flow Diagram

```
User Login
    ↓
AuthProvider.getSession()
    ↓
user.id exists?
    ↓ YES
supabase.rpc('is_app_admin')
    ↓
isAppAdmin = result
    ↓
useAuth() hook
    ↓
Component (FanPostCard, EventDetailsScreen, etc.)
    ↓
canEdit/canDelete(userId, isAppAdmin, ...)
    ↓
if (isAppAdmin) return true ← BYPASS ALL CHECKS
    ↓
Show/Hide UI elements
```

## ✅ Checklist

Verificer at følgende er på plads:

- [x] RPC function `is_app_admin()` deployed til Supabase
- [x] `AuthProvider.tsx` kalder RPC ved session change
- [x] `isAppAdmin` eksponeret i `useAuth()` hook
- [x] Alle `canEdit*/canDelete*` funktioner checker `isAppAdmin` først
- [x] `FanPostCard` bruger `isAppAdmin` fra hook
- [x] `EventDetailsScreen` bruger `isAppAdmin` fra hook
- [x] `HomeScreen` har debug logging
- [x] Debug logs er bag `__DEV__` guard
- [x] Test user tilføjet til `app_admins` table
- [x] App genstartet og logget ind
- [x] Console viser admin status
- [x] UI viser menu på alt indhold for admin

## 🎯 Næste Skridt

1. **Test RLS Policies:**
   - Verificer at admin kan delete på server-side
   - Test at non-admin bliver blokeret af RLS

2. **Add Community Admin:**
   - Allerede implementeret for events via `organizer_group_id`
   - Se [EDIT_DELETE_UI.md](./EDIT_DELETE_UI.md) for details

3. **Monitor Production:**
   - Tilføj analytics/logging for admin actions
   - Audit trail for delete operations

## 📚 Related Documentation

- [EDIT_DELETE_UI.md](./EDIT_DELETE_UI.md) - Komplet permissions guide
- [RBAC_DEPLOYMENT.md](./RBAC_DEPLOYMENT.md) - RBAC setup
- [src/utils/permissions.ts](../src/utils/permissions.ts) - Permission logic
- [src/auth/AuthProvider.tsx](../src/auth/AuthProvider.tsx) - Auth implementation
