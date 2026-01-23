import { supabase } from '../lib/supabase';

/**
 * Resolve avatar URL from database path
 * @param avatar_url - Path from profiles.avatar_url (e.g., "userId/avatar.jpg")
 * @returns Full public URL or null
 */
export function resolveAvatarUrl(avatar_url: string | null | undefined): string | null {
  if (!avatar_url) {
    return null;
  }

  // If already a full URL, return as-is
  if (avatar_url.startsWith('http')) {
    return avatar_url;
  }

  // Otherwise, get public URL from avatars bucket
  const { data } = supabase.storage.from('avatars').getPublicUrl(avatar_url);
  return data.publicUrl;
}
