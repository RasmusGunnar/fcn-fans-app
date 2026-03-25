import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { extractHashtags } from '../utils/extractHashtags';
import { extractMentions } from '../utils/extractMentions';

export type MentionedProfile = {
  id: string;
  username: string | null;
};

export async function resolveMentionedProfiles(text: string): Promise<MentionedProfile[]> {
  const mentions = extractMentions(text);

  if (mentions.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .in('username', mentions);

    if (error) {
      throw error;
    }

    const profiles = ((data || []) as { id: string; username?: string | null }[]).map(
      (profile) => ({
        id: profile.id,
        username: profile.username ?? null,
      }),
    );

    return Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values());
  } catch (error) {
    logger.warn('[postEntities] Failed to resolve mentions', error);
    return [];
  }
}

export async function persistPostEntities(
  postId: string,
  text: string,
): Promise<{ hashtags: string[]; mentionedProfiles: MentionedProfile[] }> {
  if (!postId) {
    return { hashtags: [], mentionedProfiles: [] };
  }

  const hashtags = extractHashtags(text);

  if (hashtags.length > 0) {
    const { error } = await supabase.from('hashtags').insert(
      hashtags.map((tag) => ({
        tag,
        post_id: postId,
      })),
    );

    if (error) {
      logger.warn('[postEntities] Failed to persist hashtags', error);
    }
  }

  const mentionedProfiles = await resolveMentionedProfiles(text);

  if (mentionedProfiles.length > 0) {
    const { error } = await supabase.from('mentions').insert(
      mentionedProfiles.map((profile) => ({
        mentioned_user_id: profile.id,
        post_id: postId,
      })),
    );

    if (error) {
      logger.warn('[postEntities] Failed to persist mentions', error);
    }
  }

  return { hashtags, mentionedProfiles };
}

export async function resolveProfileIdByUsername(username: string): Promise<string | null> {
  const normalizedUsername = username.replace('@', '').trim().toLowerCase();

  if (!normalizedUsername) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  } catch (error) {
    logger.warn('[postEntities] Failed to resolve profile by username', error);
    return null;
  }
}
