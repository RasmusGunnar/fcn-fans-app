import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { canCreateMatchCheckIn } from '../utils/matchdayState';
import { getStadiumLiveParticipants } from './stadiumLiveApi';

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

export async function fetchMatchCheckInSnapshot({
  matchId,
}: {
  matchId: string;
  currentUserId?: string;
}): Promise<MatchCheckInSnapshot> {
  const { data, error } = await supabase.rpc('get_match_checkin_snapshot', {
    p_match_id: matchId,
  });

  if (error) throw error;

  const payload = (data ?? {}) as {
    count_checked_in?: number;
    is_checked_in?: boolean;
    profiles?: CheckInProfile[];
  };
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  const userIds = profiles.map((profile) => profile.user_id);

  return {
    countCheckedIn: Number(payload.count_checked_in ?? 0),
    profiles,
    userIds,
    avatars: profiles
      .map((profile) => resolveAvatarUrl(profile.avatar_url))
      .filter((url): url is string => !!url),
    isCheckedIn: payload.is_checked_in === true,
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
    const page = await getStadiumLiveParticipants({ eventId: matchId, limit: 50 });
    return page.participants.map((participant) => ({
      user_id: participant.userId,
      display_name: participant.displayName,
      avatar_url: participant.avatarUrl,
    }));
  } catch (error) {
    logger.error('[checkins] Error loading check-ins:', error);
    throw error;
  }
}
