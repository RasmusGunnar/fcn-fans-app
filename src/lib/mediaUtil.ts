/**
 * Media normalization utilities for posts.
 * Handles media in various formats: null, array, JSON string, different URL fields.
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
 * Normalize post.media to a consistent MediaItem array.
 * Handles: null, undefined, array, JSON string
 */
export function normalizeMedia(media: unknown): MediaItem[] {
  if (!media) {
    return [];
  }

  // If it's a JSON string, try to parse it
  if (typeof media === 'string') {
    try {
      const parsed = JSON.parse(media);
      return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
    } catch (e) {
      console.warn('[mediaUtil] Failed to parse media JSON', { media });
      return [];
    }
  }

  // If it's already an array, return as-is
  if (Array.isArray(media)) {
    return media as MediaItem[];
  }

  // Otherwise, return empty
  return [];
}

/**
 * Extract the first usable image URL from a media item.
 * Checks: url → publicUrl → path (requires storage helper)
 */
export function getImageUrl(media: MediaItem | undefined): string | null {
  if (!media) return null;

  // Direct URL
  if (media.url) {
    return media.url;
  }

  // Public URL (from Supabase getPublicUrl)
  if (media.publicUrl) {
    return media.publicUrl;
  }

  // Path (would need to fetch public URL from Supabase; skipped in MVP)
  // In production, you'd call supabase.storage.from('post-media').getPublicUrl(media.path)
  if (media.path) {
    console.warn('[mediaUtil] Media has path but no URL; skipping', { path: media.path });
  }

  return null;
}
