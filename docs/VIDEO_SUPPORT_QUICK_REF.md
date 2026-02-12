# Video Support - Quick Reference Guide

## 🎬 What Was Added

Your React Native/Expo app now supports **video recording and library selection** in posts, alongside the existing photo support.

### User Features
✅ "Optag video" button in + menu (record new video)
✅ "Vælg fra bibliotek" now accepts both photos AND videos
✅ Video preview in composer (dark box with play icon)
✅ Video in feed shows as clickable placeholder
✅ 60-second auto-limit with user alert
✅ Avatar uploads remain image-only (protected)

---

## 🔧 Key Files Changed

### Picker Logic
**`src/lib/mediaPicker.ts`**
```typescript
// New function for video recording
export async function recordVideo(): Promise<PickedMedia | null>

// Now supports photo + video
export async function pickFromLibrary(): Promise<PickedMedia | null>

// Image-only picker (for avatars)
export async function pickImageFromLibrary(): Promise<PickedMedia | null>

// New type (replaces MediaAsset)
export type PickedMedia = {
  uri: string;
  type: 'image' | 'video';
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileName?: string | null;
}
```

### Post Creation
**`src/components/PostComposer.tsx`**
- Added `handleRecordVideo()` button handler
- Added video preview placeholder with play circle icon
- Posts now save `media_type` field in Supabase

**`src/screens/CreateScreen.tsx`**
- Updated to use `PickedMedia` type
- Posts save `media_type` on insert

### Post Display
**`src/components/cards/FanPostCard.tsx`**
- Videos show as dark placeholder with white play icon
- Tap to open in default media app (via `Linking.openURL()`)
- (TODO: Add `expo-av` for in-app player later)

### Upload
**`src/lib/upload.ts`**
- Reads base64 from file system on-demand (no longer required in picker)
- Correct MIME type for videos vs images

### Protection
**`src/lib/uploadAvatar.ts`**
- Guard: rejects video assets, only allows images

**`src/screens/CommunityDetailScreen.tsx`**
- Uses `pickImageFromLibrary()` to prevent video selection on community avatar

---

## 📊 Data Model

### Posts Table (New)
```sql
-- Column added by migration
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;
  -- Values: 'image' | 'video' | null
  -- Backfilled existing records with 'image'
```

### Post Object (Unchanged but Enhanced)
```typescript
{
  id: string;
  author_id: string;
  text: string;
  media?: [
    {
      bucket: 'post-media';
      path: 'userId/2025-02/uuid.jpg|mp4';
      type: 'image' | 'video';
      width?: number;
      height?: number;
    }
  ];
  media_type?: 'image' | 'video'; // ← NEW FIELD
}
```

---

## 🚀 How It Works

### User Records/Selects Video
```
1. User taps "Optag video" or "Vælg fra bibliotek"
2. mediaPicker.recordVideo() or pickFromLibrary() called
3. Checks permissions → shows alert if denied
4. User records/selects media
5. Duration validated (max 60s) → alert if too long
6. Returns PickedMedia or null
```

### Video Is Uploaded
```
1. upload.uploadMediaToSupabase() receives PickedMedia
2. Reads file as base64 from file system
3. Sends to Supabase with correct MIME type
4. Returns { path, type, width, height }
```

### Post Is Created
```
1. PostComposer saves media[] array to posts table
2. Also saves media_type field ('image' or 'video')
3. Returns from DB with all fields populated
```

### Video Appears in Feed
```
1. FanPostCard detects isVideoMedia(firstMedia)
2. Shows dark placeholder instead of image
3. Renders white play icon + "Video vedhæftet" text
4. User taps → opens URL in default app
```

---

## ⚠️ Guard Rails

All input validation happens at picker level with user alerts:

| Scenario | Handler | User Sees |
|----------|---------|-----------|
| Permission denied | `ensurePermissions()` → Alert | "Giv adgang til..." |
| No file selected | `pickFromLibrary()` check | "Kunne ikke læse filen" |
| Video > 60s | Duration check | "Videoen er for lang" |
| Missing URI | Asset validation | "Kunne ikke læse filen" |
| Video as avatar | `uploadAvatar` guard | "Vælg venligst et billede" |

---

## 🧪 Testing

### Record New Video
```
1. Tap + in nav
2. Select "Opret opslag"
3. Tap "Optag video"
4. Record video (< 60s)
5. Should show dark preview with play icon
6. Tap "Del opslag"
7. Check DB: posts.media_type = 'video'
```

### Choose from Library
```
1. Tap + → "Opret opslag"
2. Tap "Vælg fra bibliotek"
3. Select photo OR video
4. Photo → shows thumbnail
5. Video → shows dark placeholder
6. Tap "Del opslag"
```

### Play Video in Feed
```
1. Scroll feed with video post
2. Tap video placeholder
3. Opens in default media app
```

### Avatar Protection
```
1. Go to profile → edit avatar
2. Tap "Bibliotek"
3. Try to select video
4. Should be rejected at picker level (images only)
```

---

## 🛠️ For Future Developers

### Add In-App Video Player
1. Install: `expo install expo-av`
2. Replace `Linking.openURL()` in `FanPostCard.tsx` with `<Video>` component
3. Wrap in modal or detail screen

### Add Video Thumbnail Generation
1. Research `expo-video-thumbnails` or similar
2. Generate on upload, store path in posts table
3. Show thumbnail instead of play icon

### Support Multiple Files
1. Change media[] to accept many items
2. Create carousel/gallery in feed
3. Update upload to handle multiple loops

### Add Video Compression
1. Install: `expo install @react-native-camera-roll/camera-roll`
2. Compress before upload
3. Show progress bar during compression

---

## 📖 Documentation Files

- **Full Implementation**: `docs/VIDEO_SUPPORT_IMPLEMENTATION.md`
- **This Quick Ref**: `docs/VIDEO_SUPPORT_QUICK_REF.md` ← You are here

---

## 💬 Q&A

**Q: Why are images converted to JPEG but videos aren't?**
A: iOS returns HEIC format which older systems can't read. Videos have better codec support across platforms.

**Q: Where do I change the 60-second limit?**
A: In `mediaPicker.ts`, look for `videoMaxDuration: 60` in `recordVideo()` and `pickFromLibrary()`.

**Q: How do I show videos in feed?**
A: They appear automatically! Font Card detects `isVideoMedia()` and renders the placeholder. Soon you'll add an in-app player.

**Q: What if video upload fails?**
A: Error is caught and shown to user. They can retry. Failed file is not saved to DB.

**Q: Can users record audio-only?**
A: No, the camera picker requires video type explicitly.

**Q: Why read base64 in upload and not picker?**
A: For scalability - picker stays fast, upload can be retried/canceled without blocking UI.

---

## 🔗 Related Docs

- Migration file: `supabase/migrations/20260211120000_add_posts_media_type.sql`
- Old media handling: `src/utils/media.ts` (normalizeMedia, resolveMediaUrl, isVideoMedia)
- Post types: `src/types/post.ts`

---

**Last Updated**: February 11, 2026
**Status**: ✅ Ready for testing
