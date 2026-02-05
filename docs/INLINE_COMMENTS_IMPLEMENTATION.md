# Instagram-Style Inline Comments Implementation

## Overview

Implemented universal inline comments system for all feed item types (posts, news, events, matches) without navigation. Comments fold in/out under each card when clicking the comment button.

## Changed Files

### 1. **supabase/migrations_legacy/20260123000001_create_comments_v2.sql** (NEW)

- Created `comments_v2` table with universal commenting support
- Fields:
  - `id` (uuid, primary key)
  - `created_at` (timestamp)
  - `author_id` (uuid, references auth.users)
  - `target_type` (enum: 'post'|'news'|'event'|'match')
  - `target_id` (text) - supports various ID formats (UUID for posts, stable IDs for others)
  - `text` (text, 1-2000 chars)
- Indexes: target lookup, author lookup, created_at ordering
- RLS policies:
  - Read: all users
  - Insert: authenticated users (own comments only)
  - Delete: comment author OR app_admin
- Helper function: `get_comment_count(target_type, target_id)`

### 2. **src/components/comments/InlineComments.tsx** (NEW)

- Universal inline comments component
- Props:
  - `targetType`: 'post'|'news'|'event'|'match'
  - `targetId`: string (supports UUID or any stable ID)
  - `currentUserId`: string | undefined
  - `isAppAdmin`: boolean
  - `onCommentCountChange`: (count: number) => void (callback for parent)
- Features:
  - Fetch comments from comments_v2
  - Display comments with author names (fetched from profiles)
  - Input field + Send button
  - Delete own/admin comments (× icon)
  - Loading/error states
  - Instagram-style layout (latest comments at bottom)
  - Auto-updates parent comment count
- Displays "Dig" for own comments, email for others
- Login prompt if not authenticated

### 3. **src/components/cards/FanPostCard.tsx** (UPDATED)

- Added `InlineComments` import
- Added state: `commentsOpen`, `dynamicCommentsCount`
- Removed default "kommer snart" alert
- onPressComment now toggles `commentsOpen`
- Renders `<InlineComments targetType="post" targetId={post.id} />` when open
- Comment count updates dynamically from InlineComments

### 4. **src/components/cards/NewsCard.tsx** (UPDATED)

- Added `useState`, `useAuth`, `InlineComments` imports
- Added state: `commentsOpen`, `dynamicCommentsCount`
- onPressComment toggles `commentsOpen`
- Renders `<InlineComments targetType="news" targetId={newsItem.id} />` when open
- Comment count updates dynamically
- Uses `newsItem.id` as stable targetId

### 5. **src/components/cards/EventCard.tsx** (UPDATED)

- Simple EventCard for HomeScreen
- Added `useState`, `useAuth`, `InlineComments` imports
- Added `eventId` prop (required)
- Added state: `commentsOpen`, `dynamicCommentsCount`
- onPressComment toggles `commentsOpen`
- Renders `<InlineComments targetType="event" targetId={eventId} />` when open
- Comment count updates dynamically

### 6. **src/components/events/EventCard.tsx** (UPDATED)

- Detailed EventCard for EventsScreen
- Added `useState`, `useAuth`, `CardActions`, `InlineComments` imports
- Added `eventId` prop (required)
- Added optional props: `liked`, `likes`, `comments`, `onToggleLike`, `onPressShare`
- Replaced `TouchableOpacity` wrapper with `Pressable` inside Card
- Added state: `commentsOpen`, `dynamicCommentsCount`
- Added `CardActions` component
- Renders `<InlineComments targetType="event" targetId={eventId} />` when open
- Comment count updates dynamically

### 7. **src/components/events/MatchCard.tsx** (UPDATED)

- Added `useState`, `useAuth`, `CardActions`, `InlineComments` imports
- Added `matchId` prop (required)
- Added optional props: `liked`, `likes`, `comments`, `onToggleLike`, `onPressShare`
- Replaced `TouchableOpacity` wrapper with `Pressable` inside Card
- Added state: `commentsOpen`, `dynamicCommentsCount`
- Added `CardActions` component
- Renders `<InlineComments targetType="match" targetId={matchId} />` when open
- Comment count updates dynamically

## Target ID Strategy

### Stable IDs for Each Type:

1. **Posts**:
   - Use `post.id` (UUID from posts table)
   - Already stable and unique

2. **News**:
   - Use `newsItem.id` (UUID from news table)
   - If news items don't have UUIDs, need to generate stable IDs
   - Current implementation assumes `newsItem.id` exists

3. **Events**:
   - Use `event.id` (UUID from events table)
   - Events have stable UUIDs: `id: string` field in Event interface
   - Bus trips also have UUIDs

4. **Matches**:
   - Use `match.id` or `fixture.id` (UUID from fixtures table)
   - Fixtures have stable UUIDs: `id: string` field in Fixture interface

### Ensuring Stable IDs:

All entity types already have UUID `id` fields from Supabase tables:

- `posts.id` → uuid
- `news.id` → uuid (if table exists)
- `events.id` → uuid
- `fixtures.id` → uuid

**If news items lack stable IDs**, implement one of these strategies:

1. Add UUID primary key to news table
2. Use hash of URL as stable ID: `crypto.createHash('sha256').update(newsItem.url).digest('hex').substring(0, 36)`
3. Store news in Supabase table with UUID primary key

## Touch Handling Architecture

### Card Press Behavior:

- **Card content (Pressable)**: Navigates to detail screen
- **CardActions (comment/like/share buttons)**: Uses `pointerEvents="auto"` to prevent bubbling
- **InlineComments**: Renders below CardActions, doesn't interfere with navigation

### How it works:

1. Card content wrapped in `Pressable` with `onPress` navigation
2. `CardActions` container uses `pointerEvents="box-none"`
3. Individual action buttons use `pointerEvents="auto"`
4. Comment button press → toggles `commentsOpen`, doesn't navigate
5. Tapping card content → navigates as before

## Migration Instructions

### 1. Run Supabase Migration:

```bash
# Apply migration to your Supabase project
supabase db push
# Or manually run the SQL file in Supabase dashboard
```

### 2. Update Component Usages:

**HomeScreen** (if using simple EventCard):

```tsx
<EventCard
  eventId={event.id} // ADD THIS
  title={event.title}
  date={event.date}
  location={event.location}
  spotsLeft={event.spotsLeft}
  liked={event.liked}
  likes={event.likes}
  comments={event.comments}
  onToggleLike={() => {}}
  onPressComment={() => {}} // Will be handled internally now
  onPressShare={() => {}}
  onPressBook={() => {}}
/>
```

**EventsScreen** (using detailed EventCard):

```tsx
<GenericEventCard
  eventId={item.id} // ADD THIS
  title={item.title}
  startAt={item.startAt}
  location={item.location}
  organizerName={item.organizerName}
  description={item.description}
  liked={false} // ADD if tracking likes
  likes={0} // ADD if tracking likes
  comments={0} // ADD if tracking comments
  onPress={() => navigation.navigate('EventDetails', { eventId: item.id })}
  onToggleLike={() => {}} // ADD if implementing likes
  onPressShare={() => {}} // ADD if implementing share
/>
```

**MatchCard Usage**:

```tsx
<MatchCard
  matchId={fixture.id} // ADD THIS
  home={fixture.home_team}
  away={fixture.away_team}
  homeLogo={fixture.home_logo_url}
  awayLogo={fixture.away_logo_url}
  kickoffAt={fixture.kickoff_at}
  venue={fixture.venue}
  venueCity={fixture.venue_city}
  competition={fixture.competition}
  round={fixture.round}
  liked={false} // ADD if tracking likes
  likes={0} // ADD if tracking likes
  comments={0} // ADD if tracking comments
  onPress={() => navigation.navigate('MatchDetails', { fixtureId: fixture.id })}
  onToggleLike={() => {}} // ADD if implementing likes
  onPressShare={() => {}} // ADD if implementing share
/>
```

### 3. Fix NewsCard if News Items Lack UUIDs:

If `newsItem.id` doesn't exist or isn't stable:

**Option A**: Add UUID to news table

```sql
ALTER TABLE news ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
```

**Option B**: Generate stable ID from URL

```typescript
// In NewsCard component
import { createHash } from 'crypto';

const stableId = newsItem.id || createHash('sha256')
  .update(newsItem.url)
  .digest('hex')
  .substring(0, 36);

<InlineComments targetType="news" targetId={stableId} ... />
```

## Testing Checklist

- [ ] Post comments: create, view, delete own
- [ ] News comments: create, view, delete own
- [ ] Event comments: create, view, delete own
- [ ] Match comments: create, view, delete own
- [ ] Toggle comment section (fold in/out)
- [ ] Comment count updates after adding/deleting
- [ ] Card navigation still works (tapping content)
- [ ] Admin can delete any comment
- [ ] Users can only delete own comments
- [ ] Login prompt shows when not authenticated
- [ ] Loading/error states display correctly
- [ ] Latest comments appear at bottom (Instagram-style)

## Future Enhancements

1. **Real-time comments**: Subscribe to comments_v2 changes with Supabase Realtime
2. **Comment reactions**: Add emoji reactions to comments
3. **Reply threading**: Nest replies under comments
4. **Mentions**: @mention users in comments
5. **Rich text**: Support basic formatting (bold, italic, links)
6. **Comment moderation**: Flag/report system
7. **Optimistic updates**: Show comment immediately before DB confirmation
8. **Pagination**: Load older comments on scroll
9. **Comment notifications**: Notify users of replies/mentions

## Architecture Benefits

✅ **Universal**: Single component works for all entity types  
✅ **No navigation**: Comments stay inline (Instagram-style)  
✅ **Stable IDs**: Works with UUID or any stable identifier  
✅ **Dynamic counts**: Comment count updates without refresh  
✅ **Clean separation**: CardActions independent of parent navigation  
✅ **Type-safe**: Full TypeScript support with discriminated union  
✅ **Scalable**: Easy to add new entity types (just add to enum)  
✅ **RLS secured**: Supabase Row Level Security enforces permissions
