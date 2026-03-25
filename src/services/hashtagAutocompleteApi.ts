import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

const SUGGESTION_LIMIT = 6;
const QUERY_LIMIT = 60;

export async function searchHashtagSuggestions(query: string): Promise<string[]> {
  const normalizedQuery = query.trim().replace(/^#+/, '').toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('hashtags')
      .select('tag')
      .ilike('tag', `${normalizedQuery}%`)
      .limit(QUERY_LIMIT);

    if (error) {
      throw error;
    }

    const counts = new Map<string, number>();

    ((data || []) as { tag?: string | null }[]).forEach((row) => {
      const tag = row.tag?.trim().toLowerCase();
      if (!tag) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })
      .slice(0, SUGGESTION_LIMIT)
      .map(([tag]) => tag);
  } catch (error) {
    logger.warn('[hashtagAutocompleteApi] searchHashtagSuggestions failed:', error);
    return [];
  }
}
