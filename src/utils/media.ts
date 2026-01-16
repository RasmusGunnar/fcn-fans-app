import { supabase } from '../lib/supabase';

/**
 * Unified media item type across the app.
 * Supports url, publicUrl, or path for flexibility.
 */
export type MediaItem = {
  url?: string;
  publicUrl?: string;
  path?: string;
  type?: 'image' | 'video';
  width?: number;
  height?: number;
};

/**
 * Normalize post.media from various formats to consistent MediaItem[] array.
 * Handles: null, undefined, array, JSON string, single object.
 *
 * @param media - Raw media from post (could be null, array, JSON string, etc.)
 * @returns Normalized MediaItem[] array, empty if no valid media
 */
export function normalizeMedia(media: unknown): MediaItem[] {
  if (!media) {
    return [];
  }

  // If it's a JSON string, try to parse it
  if (typeof media === 'string') {
    try {
      const parsed = JSON.parse(media);
      // Parsed could be an array or single object
      return Array.isArray(parsed) ? (parsed as MediaItem[]) : [parsed as MediaItem];
    } catch (e) {
      if (__DEV__) {
        console.warn('[normalizeMedia] Failed to parse JSON string:', { media, error: String(e) });
      }
      return [];
    }
  }

  // If it's already an array, return as-is
  if (Array.isArray(media)) {
    return media as MediaItem[];
  }

  // If it's a single object, wrap in array
  if (typeof media === 'object' && media !== null) {
    return [media as MediaItem];
  }

  return [];
}

/**
 * Resolve a media item to a usable image/video URL.
 * Tries in order: url → publicUrl → path (via supabase)
 *
 * For path, this is ASYNC and would require refactoring FanPostCard to use async.
 * In MVP, we log a warning and skip path.
 *
 * @param media - MediaItem to resolve
 * @returns Resolved URL string, or null if no usable URL found
 */
export function resolveMediaUrl(media: MediaItem | undefined): string | null {
  if (!media) {
    return null;
  }

  // Priority 1: Direct URL (most common from upload.ts)
  if (media.url) {
    return media.url;
  }

  // Priority 2: Public URL (from Supabase getPublicUrl response)
  if (media.publicUrl) {
    return media.publicUrl;
  }

  // Priority 3: Path (would require async call, not ideal in render)
  if (media.path) {
    if (__DEV__) {
      console.warn(
        '[resolveMediaUrl] Media has path but no URL. For best performance, include url or publicUrl in media object.',
        { path: media.path }
      );
    }
    // In production, you could do:
    // const { data } = supabase.storage.from('post-media').getPublicUrl(media.path);
    // return data.publicUrl;
    // But this requires async, so we skip for now.
  }

  return null;
}

/**
 * Check if a media item is a video.
 * Robustly checks type field and falls back to URL extension if needed.
 */
export function isVideoMedia(media: MediaItem | undefined): boolean {
  if (!media) return false;
  
  // Explicit type check first
  if (media.type === 'video') return true;
  
  // Fallback: check URL/path extensions
  const checkableUrl = media.url || media.publicUrl || media.path || '';
  if (!checkableUrl) return false;
  
  const lowerUrl = checkableUrl.toLowerCase();
  return lowerUrl.includes('.mp4') || lowerUrl.includes('.mov') || lowerUrl.includes('.m4v') || lowerUrl.includes('video');
}

/**
 * Check if a media item has a resolvable URL.
 */
export function hasResolvableUrl(media: MediaItem | undefined): boolean {
  return !!resolveMediaUrl(media);
}
