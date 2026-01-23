import { supabase } from './supabase';

/**
 * Get the public URL for a storage object.
 *
 * @param bucket - The storage bucket name (e.g., "avatars", "post-media")
 * @param path - The path to the object in the bucket (e.g., "userId.jpg", "postId/image.jpg")
 * @returns The public URL or null if path is not provided
 */
export function getPublicUrl(bucket: string, path?: string | null): string | null {
  if (!path) {
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data.publicUrl;

  if (__DEV__) {
    console.log('[getPublicUrl]', { bucket, path, url });
  }

  return url;
}
