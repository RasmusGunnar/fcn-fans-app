import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { canCreateMatchCheckIn } from '../utils/matchdayState';

export interface MatchCheckInSnapshot {
  countCheckedIn: number;
  avatars: string[];
  profiles: CheckInProfile[];
  userIds: string[];
  isCheckedIn: boolean;
}

export interface CheckInProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

async function fetchProfiles(userIds: string[]): Promise<CheckInProfile[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
  if (error) throw error;

  return (data || []).map((profile) => ({
    user_id: profile.id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
  }));
}

export async function fetchMatchCheckInSnapshot({
  matchId,
  currentUserId,
}: {
  matchId: string;
  currentUserId?: string;
}): Promise<MatchCheckInSnapshot> {
  const { data, error } = await supabase
    .from('match_checkins')
    .select('user_id')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const userIds = (data || []).map((row: { user_id: string }) => row.user_id);
  const profiles = await fetchProfiles(userIds);

  return {
    countCheckedIn: userIds.length,
    profiles,
    userIds,
    avatars: profiles
      .map((profile) => resolveAvatarUrl(profile.avatar_url))
      .filter((url): url is string => !!url),
    isCheckedIn: !!(currentUserId && userIds.includes(currentUserId)),
  };
}

export async function createMatchCheckIn({
  matchId,
  userId,
  kickoffAt,
}: {
  matchId: string;
  userId: string;
  kickoffAt?: string | null;
}): Promise<void> {
  if (!canCreateMatchCheckIn(kickoffAt)) {
    throw new Error('Check-in er ikke åbent endnu.');
  }

  const { error } = await supabase
    .from('match_checkins')
    .upsert([{ match_id: matchId, user_id: userId }], { onConflict: 'match_id,user_id' });

  if (error) {
    logger.error('[checkins] Error creating check-in:', error);
    throw error;
  }
}

export async function fetchMatchCheckIns(matchId: string): Promise<CheckInProfile[]> {
  try {
    const { data, error } = await supabase
      .from('match_checkins')
      .select('user_id')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const userIds = (data || []).map((row: { user_id: string }) => row.user_id);
    return fetchProfiles(userIds);
  } catch (error) {
    logger.error('[checkins] Error loading check-ins:', error);
    throw error;
  }
}
