import { supabase } from '../lib/supabase';
import { getPublicUrl } from '../lib/storageUrl';

/**
 * Unified media item type across the app.
 * Now uses bucket + path structure instead of URLs.
 */
export type MediaItem = {
  bucket?: string;
  path?: string;
  // Legacy fields for backwards compatibility
  url?: string;
  publicUrl?: string;
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
    // Check if it's a direct URL (starts with http:// or https://)
    if (media.startsWith('http://') || media.startsWith('https://')) {
      return [{ url: media }];
    }
    
    // Otherwise try to parse as JSON
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
 * Now uses bucket + path with getPublicUrl helper.
 *
 * Priority: bucket+path → url → publicUrl (legacy)
 *
 * @param media - MediaItem to resolve
 * @returns Resolved URL string, or null if no usable URL found
 */
export function resolveMediaUrl(media: MediaItem | undefined): string | null {
  if (!media) {
    return null;
  }

  // Priority 1: bucket + path (new structure)
  if (media.bucket && media.path) {
    const url = getPublicUrl(media.bucket, media.path);
    if (__DEV__) {
      console.log('[resolveMediaUrl] Resolved from bucket+path:', {
        bucket: media.bucket,
        path: media.path,
        url,
      });
    }
    return url;
  }

  // Priority 2: Direct URL (legacy)
  if (media.url) {
    return media.url;
  }

  // Priority 3: Public URL (legacy)
  if (media.publicUrl) {
    return media.publicUrl;
  }

  // Priority 4: Path only (try post-media bucket)
  if (media.path) {
    if (__DEV__) {
      console.warn('[resolveMediaUrl] Media has path but no bucket. Assuming post-media bucket.', {
        path: media.path,
      });
    }
    return getPublicUrl('post-media', media.path);
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
  return (
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.mov') ||
    lowerUrl.includes('.m4v') ||
    lowerUrl.includes('video')
  );
}

/**
 * Check if a media item has a resolvable URL.
 */
export function hasResolvableUrl(media: MediaItem | undefined): boolean {
  return !!resolveMediaUrl(media);
}
