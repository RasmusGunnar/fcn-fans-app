import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export interface PushPreferences {
  repliesEnabled: boolean;
  mentionsEnabled: boolean;
  matchdayCheckinEnabled: boolean;
  communityActivityEnabled: boolean;
  highfivesEnabled: boolean;
  mediaDigestEnabled: boolean;
  updatedAt: string | null;
}

type PushPreferencesRow = {
  user_id: string;
  replies_enabled: boolean | null;
  mentions_enabled: boolean | null;
  matchday_checkin_enabled: boolean | null;
  community_activity_enabled: boolean | null;
  highfives_enabled: boolean | null;
  media_digest_enabled: boolean | null;
  updated_at: string | null;
};

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  repliesEnabled: true,
  mentionsEnabled: true,
  matchdayCheckinEnabled: true,
  communityActivityEnabled: true,
  highfivesEnabled: true,
  mediaDigestEnabled: true,
  updatedAt: null,
};

function mapRowToPreferences(row: PushPreferencesRow | null | undefined): PushPreferences {
  if (!row) {
    return { ...DEFAULT_PUSH_PREFERENCES };
  }

  return {
    repliesEnabled: row.replies_enabled ?? DEFAULT_PUSH_PREFERENCES.repliesEnabled,
    mentionsEnabled: row.mentions_enabled ?? DEFAULT_PUSH_PREFERENCES.mentionsEnabled,
    matchdayCheckinEnabled:
      row.matchday_checkin_enabled ?? DEFAULT_PUSH_PREFERENCES.matchdayCheckinEnabled,
    communityActivityEnabled:
      row.community_activity_enabled ?? DEFAULT_PUSH_PREFERENCES.communityActivityEnabled,
    highfivesEnabled: row.highfives_enabled ?? DEFAULT_PUSH_PREFERENCES.highfivesEnabled,
    mediaDigestEnabled: row.media_digest_enabled ?? DEFAULT_PUSH_PREFERENCES.mediaDigestEnabled,
    updatedAt: row.updated_at ?? null,
  };
}

function isMissingPreferencesTable(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === '42P01' || error?.message?.toLowerCase().includes('push_preferences') === true
  );
}

export async function getPushPreferences(userId: string): Promise<PushPreferences> {
  try {
    const { data, error } = await supabase
      .from('push_preferences')
      .select(
        'user_id, replies_enabled, mentions_enabled, matchday_checkin_enabled, community_activity_enabled, highfives_enabled, media_digest_enabled, updated_at',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingPreferencesTable(error)) {
        return { ...DEFAULT_PUSH_PREFERENCES };
      }
      logger.warn('[pushPreferencesApi] getPushPreferences failed:', error);
      return { ...DEFAULT_PUSH_PREFERENCES };
    }

    return mapRowToPreferences((data as PushPreferencesRow | null) ?? null);
  } catch (error) {
    logger.warn('[pushPreferencesApi] getPushPreferences threw:', error);
    return { ...DEFAULT_PUSH_PREFERENCES };
  }
}

export async function savePushPreferences(
  userId: string,
  updates: Partial<
    Pick<
      PushPreferences,
      | 'communityActivityEnabled'
      | 'highfivesEnabled'
      | 'matchdayCheckinEnabled'
      | 'mediaDigestEnabled'
      | 'mentionsEnabled'
      | 'repliesEnabled'
    >
  >,
): Promise<PushPreferences> {
  const payload = {
    user_id: userId,
    ...(updates.repliesEnabled !== undefined ? { replies_enabled: updates.repliesEnabled } : {}),
    ...(updates.mentionsEnabled !== undefined ? { mentions_enabled: updates.mentionsEnabled } : {}),
    ...(updates.matchdayCheckinEnabled !== undefined
      ? { matchday_checkin_enabled: updates.matchdayCheckinEnabled }
      : {}),
    ...(updates.communityActivityEnabled !== undefined
      ? { community_activity_enabled: updates.communityActivityEnabled }
      : {}),
    ...(updates.highfivesEnabled !== undefined
      ? { highfives_enabled: updates.highfivesEnabled }
      : {}),
    ...(updates.mediaDigestEnabled !== undefined
      ? { media_digest_enabled: updates.mediaDigestEnabled }
      : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('push_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select(
      'user_id, replies_enabled, mentions_enabled, matchday_checkin_enabled, community_activity_enabled, highfives_enabled, media_digest_enabled, updated_at',
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapRowToPreferences((data as PushPreferencesRow | null) ?? null);
}
