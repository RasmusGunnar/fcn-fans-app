# Video Support Implementation Summary

## ✅ Completed Changes

### 1. **Core Media Picker Updates** (`src/lib/mediaPicker.ts`)

#### New Types
- Added `PickedMedia` type with clean structure:
  ```typescript
  type PickedMedia = {
    uri: string;
    type: 'image' | 'video';
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    fileName?: string | null;
  }
  ```
- `MediaAsset` now aliases to `PickedMedia` for compatibility

#### Updated Functions
- **`ensurePermissions()` & `ensureCameraPermissions()`**: Now return `boolean` and show `Alert` on denial
- **`pickFromLibrary()`**: 
  - Updated to use `ImagePicker.MediaTypeOptions.All` (both image & video)
  - Validates video duration ≤ 60 seconds with alert
  - Guards against missing URI
  - Converts images to JPEG on iOS (HEIC handling)
  
- **`pickCameraPhoto()`**: Kept as image-only for backwards compatibility

#### New Functions
- **`recordVideo()`**: 
  - Video-only camera capture with 60-second limit
  - Returns `PickedMedia | null`
  - Guards: permission check, URI validation, duration limit
  
- **`pickImageFromLibrary()`**:
  - Image-only library picker (for avatars)
  - Returns `PickedMedia | null`

### 2. **Media Upload** (`src/lib/upload.ts`)

- Updated to accept `PickedMedia` instead of `MediaAsset`
- Now reads base64 from file system with `FileSystem.readAsStringAsync()`
- Proper MIME type handling:
  - Images: `image/jpeg`
  - Videos: Uses `mimeType` from asset or falls back to `video/mp4`
- Removes `base64` requirement from picker (now fetched on-demand during upload)

### 3. **Post Composer UI** (`src/components/PostComposer.tsx`)

#### New Capabilities
- **Three media actions in the UI**:
  1. "Tag billede" (Take photo)
  2. "Optag video" (Record video) ← NEW
  3. "Vælg fra bibliotek" (Choose from library - now supports both)

#### Preview Handling
- **Images**: Shows preview thumbnail
- **Videos**: Shows placeholder with play circle icon + "Video vedhæftet" label
- **Remove**: Updated text to "Fjern vedhæftning" (generic)

#### Database Integration
- Posts now save `media_type` field on insert:
  ```typescript
  insert({
    author_id, text, media, 
    media_type: attachment?.type ?? null,  // ← NEW
    community_id
  })
  ```

### 4. **Create Screen Updates** (`src/screens/CreateScreen.tsx`)

- Updated to use `PickedMedia` type
- Stores `media_type` on post insert (same as PostComposer)

### 5. **Community Detail Screen** (`src/screens/CommunityDetailScreen.tsx`)

- **Avatar uploads remain image-only** ✓
- Now uses `pickImageFromLibrary()` to prevent video selection
- Guards avatar upload: rejects non-image assets with error alert

### 6. **Create Action Sheet** (`src/components/CreateActionSheet.tsx`)

- Updated type annotations to `PickedMedia`
- Uses new `recordVideo()` function for video recording

### 7. **Avatar Upload** (`src/lib/uploadAvatar.ts`)

- Added guard: rejects video assets with error alert
- Maintains image-only requirement for avatars

### 8. **Feed Card Display** (`src/components/cards/FanPostCard.tsx`)

#### Video Rendering
- **Detects video** using `isVideoMedia()` helper
- **Video placeholder**:
  - Dark background container
  - White play circle icon (centered)
  - "Video vedhæftet" text below icon
  - Pressable to open video (TODO: In-app player)

#### Fallback Behavior
- Opens video URL via `Linking.openURL()` (external app)
- Shows error alert on failure
- TODO comment for future in-app video player (expo-av)

### 9. **Database Migration** (`supabase/migrations/20260211120000_add_posts_media_type.sql`)

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;

-- Constraint (idempotent with DO $$ block)
ALTER TABLE posts
  ADD CONSTRAINT posts_media_type_check
  CHECK (media_type IN ('image', 'video'));

-- Backfill existing records
UPDATE posts SET media_type = 'image' WHERE media_url IS NOT NULL;
```

## 📋 Implementation Checklist

### Trin A - Entrypoints ✅
- [x] `mediaPicker.ts`: Multiple pickers found and updated
- [x] `+ menu`: In PostComposer with "Tag billede", "Optag video", "Vælg fra bibliotek"
- [x] Post upload: PostComposer uploads to post-media bucket with `media_type`

### Trin B - Core Picker Changes ✅
- [x] Library picker: Multi-media with video duration guard (60s)
- [x] Camera photo: Image-only (preserved)
- [x] **NEW**: `recordVideo()`: Video recording with 60s limit
- [x] Standardized return type: `PickedMedia`
- [x] Guards: permissions → Alert, canceled → null, invalid → Alert, duration → Alert

### Trin C - UI Updates ✅
- [x] Menu added in PostComposer with all three actions
- [x] "Vælg fra bibliotek" now handles both image/video
- [x] Video preview: Dark placeholder with play icon
- [x] Image preview: Thumbnail

### Trin D - Upload & Database ✅
- [x] Upload function accepts `PickedMedia`
- [x] MIME type handling (image/jpeg, video/*)
- [x] Posts table: `media_type` column + constraint
- [x] Backfill: existing records marked as 'image'

### Trin E - Video Playback ✅
- [x] Placeholder with press handler
- [x] Opens URL via `Linking.openURL()` (external app for now)
- [x] Error alerting
- [x] TODO: Future expo-av integration (check `package.json` - NOT currently installed)

### Trin F - Avatar Upload ✅
- [x] Remains image-only ✓
- [x] Guards against video with error alert

## 🎯 Key Design Decisions

1. **No base64 in mediaPicker**: Fetched on-demand during upload for better scalability
2. **Video Duration Limit**: Hard 60-second max enforced at picker level with user alerts
3. **MIME Type Flexibility**: Respects asset MIME type, falls back to standard (image/jpeg, video/mp4)
4. **Avatar Protection**: Image-only picker function prevents accidental video uploads
5. **External Video Playback**: Uses `Linking.openURL()` as temporary fallback until `expo-av` is added
6. **Idempotent Migration**: SQL uses `DO $$` block for constraint to handle re-runs safely

## 🚨 Important Notes

### Media Types
- **Images**: Always converted to JPEG (avoids HEIC issues on iOS)
- **Videos**: Stored as-is with original MIME type or `video/mp4` fallback

### Video Player
- Currently: Opens in default media app via system URL handler
- Future: Add `expo-av` package for in-app player
- No autoplay in feed (just static placeholder)

### Permissions
- Both pickers request permissions on-demand
- User-facing alerts if permission denied
- Graceful null return on cancel

### Post Type
The `media_type` field is stored alongside existing `media` array:
```typescript
posts {
  id, author_id, text, community_id,
  media: [{bucket, path, type, width, height}],  // Existing
  media_type: 'image' | 'video' | null            // NEW
}
```

Note: The `media[0].type` field also exists but `media_type` provides quick filtering without parsing JSON.

## 📝 Files Modified

### Core Libraries
1. `src/lib/mediaPicker.ts` - All picker functions + new `recordVideo()`
2. `src/lib/upload.ts` - Base64 from file system reading
3. `src/lib/uploadAvatar.ts` - Video guard

### UI Components
4. `src/components/PostComposer.tsx` - Video recording & preview
5. `src/components/CreateActionSheet.tsx` - Type updates
6. `src/components/cards/FanPostCard.tsx` - Video rendering with play icon

### Screens
7. `src/screens/CreateScreen.tsx` - Type updates + `media_type` save
8. `src/screens/CommunityDetailScreen.tsx` - Image-only avatar picker

### Database
9. `supabase/migrations/20260211120000_add_posts_media_type.sql` - New column + migration

## ✨ User-Facing Features

### In "+ Menu"
```
┌─────────────────────────────────┐
│ Tag billede       [📷]          │
│ Optag video       [🎥] ← NEW    │
│ Vælg fra bibliotek [📷📹] ← NEW │
└─────────────────────────────────┘
```

### In Feed
- **Images**: Thumbnail with 4:3 aspect
- **Videos**: Dark box with centered play icon + "Video vedhæftet" label
- **Click video**: Opens in default media app (or future in-app player)

### Throughout
- Permission alerts if access denied
- Duration alerts if video > 60 seconds
- Error alerts for invalid/missing files
- No autoplay - requires user tap

## 🔄 Testing Checklist

- [ ] Create post with photo
- [ ] Create post with video (< 60s)
- [ ] Record new video (< 60s)
- [ ] Try video > 60s (should alert)
- [ ] Permission denial (should alert)
- [ ] Edit post (text only, media untouchable)
- [ ] Delete post
- [ ] View video in feed (should open in external app)
- [ ] Avatar upload (reject if video selected)
- [ ] Community avatar (reject if video selected)
- [ ] Feed loads correctly with mixed content
- [ ] Database: Verify `media_type` saved correctly

## 🚀 Future Enhancements

1. **In-App Video Player**: Add `expo-av` package and use `<Video>` component
2. **Video Thumbnails**: Generate & cache video preview frames
3. **Video Compression**: Reduce file size before upload
4. **Trimming UI**: Allow users to trim videos before upload
5. **Multiple Media**: Allow multiple images/videos per post
6. **Video Filters**: Basic effects/filters before recording

