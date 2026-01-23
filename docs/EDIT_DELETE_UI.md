# Edit/Slet UI til RLS Testing

Denne implementation tilføjer edit og slet funktionalitet til posts, comments og events med permission-baseret adgangskontrol til at teste Row Level Security (RLS) policies.

## Permission Hierarki

### 1. System Admin (app_admins)
- Kan edit/slette **ALT** overalt
- Tjekkes via `app_admins` tabel

### 2. Community Owner/Admin (community_members)
- Kan edit/slette ALT **INDEN FOR DET FÆLLESSKAB**
- Gælder kun for events (via `organizer_group_id`)
- Posts/comments har ikke community-scope endnu (se TODO)

### 3. Content Author
- Kan kun edit/slette eget indhold

## Nye Filer

### `src/auth/AuthProvider.tsx` (opdateret)
- Tilføjet `isAppAdmin: boolean` til context
- Henter app_admins status ved login/session change
- Eksponerer `isAppAdmin` i `useAuth()` hook

### `src/hooks/useCommunityRole.ts`
Community role lookup med caching:
- `useCommunityRole(communityId)` - Hook til at hente brugerens rolle i et fællesskab
- Returnerer: `'owner' | 'admin' | 'member' | null`
- Cacher i memory for at undgå gentagne DB calls
- `clearCommunityRoleCache()` - Ryd cache når medlemskab ændres

### `src/utils/permissions.ts` (opdateret)
Permission helper funktioner med system admin og community admin support:
- `canEditPost(userId, isAppAdmin, post, communityRole?)` - Tjek om bruger kan redigere post
- `canDeletePost(userId, isAppAdmin, post, communityRole?)` - Tjek om bruger kan slette post
- `canEditComment(userId, isAppAdmin, comment, communityRole?)` - Tjek om bruger kan redigere kommentar
- `canDeleteComment(userId, isAppAdmin, comment, postAuthorId, communityRole?)` - Tjek om bruger kan slette kommentar
- `canEditEvent(userId, isAppAdmin, event, communityRole?)` - Tjek om bruger kan redigere event
- `canDeleteEvent(userId, isAppAdmin, event, communityRole?)` - Tjek om bruger kan slette event

**Regler:**
- System admin kan ALT (isAppAdmin=true)
- Events: Creator ELLER community owner/admin (via organizer_group_id) kan edit/delete
- Posts: Ejer eller admin kan redigere/slette (community scope kommer senere)
- Comments: Ejer eller post-ejer eller admin kan slette

### `src/screens/EditEventScreen.tsx`
Komplet edit screen for events:
- Form felter: title, description, start_at, end_at, location_name, location_address
- Validation: titel er påkrævet
- Save: `supabase.from('events').update(...)`
- Fejlhåndtering: viser alert hvis RLS blokerer (ingen rettigheder)
- Navigation tilbage efter success

### `src/components/OptionsMenu.tsx`
3-prik menu komponent der viser edit/slet actions:
- Bruger `ActionSheetIOS` på iOS
- Bruger custom modal på Android
- Understøtter destructive actions med confirm-dialog
- Ikoner fra Ionicons

### `src/theme/colors.ts`
Tilføjet `error: '#DC2626'` farve til destructive actions.

## Ændrede Filer

### `src/components/cards/FanPostCard.tsx`
- Bruger `isAppAdmin` fra `useAuth()` context (ikke hardcoded)
- 3-prik menu i header (kun synlig hvis bruger har rettigheder)
- Inline edit funktionalitet med TextInput
- Slet post med confirm og callback til parent
- Slet comments med × knap (synlig hvis bruger kan slette)
- Tilføjet `onDeleted` callback prop
- Opdateret comment query til at inkludere `author_id`

### `src/screens/EventDetailsScreen.tsx`
- Bruger `isAppAdmin` fra `useAuth()` context
- Bruger `useCommunityRole(event.organizer_group_id)` til community admin check
- 3-prik menu i header (synlig for creator, community admin, eller system admin)
- Edit event navigerer til `EditEventScreen`
- Slet event med confirm og navigation tilbage
- Debug logging når `__DEV__`

### `src/screens/HomeScreen.tsx`
- Bruger `isAppAdmin` fra `useAuth()` context
- Tilføjet `removePost` fra FeedContext
- Passed `onDeleted` callback til `FanPostCard`
- Debug logging når `__DEV__`

### `src/screens/PostDetailScreen.tsx`
- Tilføjet `handleDeleted` der fjerner post og navigerer tilbage
- Passed `onDeleted` callback til `FanPostCard`

### `src/state/FeedContext.tsx`
- Tilføjet `removePost(postId)` funktion til at fjerne posts fra feed
- Opdateret både `posts` og `feedItems` arrays

### `src/navigation/types.ts`
- Tilføjet `EditEvent: { eventId: string }` route

### `src/navigation/EventsStack.tsx`
- Tilføjet `EditEventScreen` til navigation stack

## Sådan Bruges Det

### Post Edit/Slet
1. Åbn en post i feed eller post details
2. Se 3-prik menuen i top-højre hjørne (kun synlig hvis du er ejer eller system admin)
3. Vælg "Redigér" for inline edit eller "Slet" for at slette
4. Slet kræver bekræftelse

### Comment Slet
1. Udvid comments på en post
2. Se × knappen ved siden af comments du kan slette (dine egne, eller alle hvis du er post-ejer/admin)
3. Klik × for at slette med bekræftelse

### Event Edit/Slet
1. Åbn event details
2. Se 3-prik menuen i header (kun synlig hvis du er creator, community admin, eller system admin)
3. Vælg "Redigér" for at åbne edit screen
4. Opdater felter og gem (RLS checker permissions på server)
5. Vælg "Slet" for at slette med bekræftelse

## Test RLS Policies

### System Admin Test
1. **Opret en system admin bruger:**
   ```sql
   INSERT INTO app_admins (user_id) VALUES ('<your-user-id>');
   ```

2. **Log ind som admin og verificer:**
   - Console skal vise: `[AuthProvider] User is app admin: <user-id>`
   - HomeScreen skal vise: `[HomeScreen] { userId: '...', isAppAdmin: true }`
   - Du skal se 3-prik menu på ALT indhold (også indhold du ikke har oprettet)

3. **Test at admin kan slette andres indhold:**
   - Åbn en post/event oprettet af en anden bruger
   - 3-prik menu skal være synlig
   - Prøv at slette - skal virke hvis RLS tillader det

### Community Admin Test
1. **Opret et event med organizer_group_id:**
   ```sql
   INSERT INTO events (title, start_at, organizer_group_id, created_by)
   VALUES ('Test Event', NOW(), '<community-id>', '<creator-user-id>');
   ```

2. **Tilføj en community admin:**
   ```sql
   INSERT INTO community_members (community_id, user_id, role)
   VALUES ('<community-id>', '<admin-user-id>', 'admin');
   ```

3. **Log ind som community admin (ikke creator):**
   - Åbn eventet
   - Console skal vise: `communityRole: 'admin'`
   - 3-prik menu skal være synlig
   - Du skal kunne redigere/slette eventet

### Regular User Test
1. **Log ind som almindelig bruger**
2. **Prøv at åbne andres posts/events:**
   - 3-prik menu skal IKKE være synlig
3. **Prøv at åbne dine egne posts/events:**
   - 3-prik menu skal være synlig
   - Du skal kunne redigere/slette

### RLS Block Test
1. **Fjern app_admins entry eller log ind som ikke-admin**
2. **Prøv at slette andres indhold via API:**
   ```javascript
   await supabase.from('events').delete().eq('id', '<other-user-event-id>');
   // Skal give fejl hvis RLS er sat korrekt
   ```
3. **Alert skal vise:** "Du har muligvis ikke rettigheder til dette."

## Debug Logging

Følgende debug logs er tilføjet (kun i `__DEV__` mode):

- `[AuthProvider] User is app admin: <user-id>` - Når admin status er hentet
- `[HomeScreen] { userId: '...', isAppAdmin: true/false }` - Ved render
- `[EventDetailsScreen] { userId, isAppAdmin, eventCreatedBy, organizerGroupId, communityRole, showEditOption, showDeleteOption }` - Ved render

## Database Krav

Sikr at følgende tabeller og kolonner eksisterer:

### Tables
- `app_admins (user_id uuid PRIMARY KEY)`
- `community_members (community_id uuid, user_id uuid, role text)`
  - Role values: 'owner', 'admin', 'member'
- `events (id, title, description, start_at, end_at, location_name, location_address, organizer_group_id uuid, created_by uuid)`
- `posts (id, author_id, text, media, created_at)`
- `comments (id, post_id, author_id, text, created_at)`

### RLS Policies
Policies bør matche logikken i `permissions.ts`:
- System admin kan ALT
- Community owner/admin kan edit/delete events i deres community
- Content author kan edit/delete eget indhold

## TODO / Future Work

### High Priority
- [ ] **Add community_id to posts table** for community-scoped moderation
  - Schema: `ALTER TABLE posts ADD COLUMN community_id uuid REFERENCES communities(id);`
  - Update `canEditPost`/`canDeletePost` to check community admin role
- [ ] **Add community_id to comments table** (inherit from post or separate)
  - Update `canDeleteComment` to check community admin role
- [ ] **Implement proper date/time picker** for EditEventScreen (i stedet for ISO string input)
- [ ] **Add toast/snackbar feedback** i stedet for alerts
- [ ] **Add loading states** for delete operations

### Medium Priority
- [ ] **Optimistic updates** for edits (update UI før server response)
- [ ] **Inline edit for comments** (som posts)
- [ ] **Bulk moderation actions** for community admins
- [ ] **Audit log** for admin actions

### Low Priority
- [ ] **Export community role** to a shared context (if needed outside events)
- [ ] **Add "edited" indicator** on edited posts/comments
- [ ] **Version history** for edited content

## Styling

Al styling følger eksisterende design system:
- Colors fra `src/theme/colors.ts`
- Spacing fra `src/theme/spacing.ts`
- Konsistent med eksisterende komponenter

