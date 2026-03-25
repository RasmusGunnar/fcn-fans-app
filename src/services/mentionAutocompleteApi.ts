import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

export type MentionSuggestion = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const SUGGESTION_LIMIT = 6;

export async function searchMentionSuggestions(query: string): Promise<MentionSuggestion[]> {
  const normalizedQuery = query.trim().replace(/^@+/, '').toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .not('username', 'is', null)
      .ilike('username', `${normalizedQuery}%`)
      .order('username', { ascending: true })
      .limit(SUGGESTION_LIMIT);

    if (error) {
      throw error;
    }

    return ((data || []) as {
      id: string;
      username?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
    }[])
      .filter((profile): profile is { id: string; username: string; display_name?: string | null; avatar_url?: string | null } =>
        typeof profile.username === 'string' && profile.username.trim().length > 0,
      )
      .map((profile) => ({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name ?? null,
        avatar_url: profile.avatar_url ?? null,
      }));
  } catch (error) {
    logger.warn('[mentionAutocompleteApi] searchMentionSuggestions failed:', error);
    return [];
  }
}
