import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { getStadiumLiveParticipants } from './stadiumLiveApi';
import { isDemoMode } from '../config/appMode';
import { getDemoParticipation, setDemoCheckedIn } from '../demo/interactions';
import { DEMO_USERS } from '../demo/users';

export type MatchCheckInParticipationState = 'checked_in' | 'eligible' | 'closed';

export interface MatchCheckInSnapshot {
  matchId: string;
  countCheckedIn: number;
  avatars: string[];
  profiles: CheckInProfile[];
  userIds: string[];
  isCheckedIn: boolean;
  stadiumLiveOpen: boolean;
  canCheckIn: boolean;
  currentUserParticipationState: MatchCheckInParticipationState;
}

export interface CheckInProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

function safeCheckInError(error: unknown, action: 'load' | 'check_in' | 'check_out'): Error {
  logger.error(`[checkins] ${action} failed`, error);
  if (action === 'check_in') return new Error('Kunne ikke tjekke dig ind. Prøv igen.');
  if (action === 'check_out') return new Error('Kunne ikke tjekke dig ud. Prøv igen.');
  return new Error('Kampstatus kunne ikke hentes. Prøv igen.');
}

function mapSnapshot(data: unknown, fallbackMatchId: string): MatchCheckInSnapshot {
  const payload = (data ?? {}) as {
    match_id?: string;
    count_checked_in?: number;
    participant_count?: number;
    is_checked_in?: boolean;
    stadium_live_open?: boolean;
    can_check_in?: boolean;
    current_user_participation_state?: MatchCheckInParticipationState;
    profiles?: CheckInProfile[];
  };
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  const userIds = profiles.map((profile) => profile.user_id);
  const isCheckedIn = payload.is_checked_in === true;
  const stadiumLiveOpen = payload.stadium_live_open === true;

  return {
    matchId: payload.match_id ?? fallbackMatchId,
    countCheckedIn: Number(payload.participant_count ?? payload.count_checked_in ?? 0),
    profiles,
    userIds,
    avatars: profiles
      .map((profile) => resolveAvatarUrl(profile.avatar_url))
      .filter((url): url is string => !!url),
    isCheckedIn,
    stadiumLiveOpen,
    canCheckIn: payload.can_check_in ?? (stadiumLiveOpen && !isCheckedIn),
    currentUserParticipationState:
      payload.current_user_participation_state ??
      (isCheckedIn ? 'checked_in' : stadiumLiveOpen ? 'eligible' : 'closed'),
  };
}

export async function fetchMatchCheckInSnapshot({
  matchId,
}: {
  matchId: string;
  currentUserId?: string;
}): Promise<MatchCheckInSnapshot> {
  if (isDemoMode) {
    const participation = getDemoParticipation();
    const profiles = DEMO_USERS.slice(0, 7).map((user) => ({
      user_id: user.id,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
    }));
    return {
      matchId,
      countCheckedIn: 18,
      avatars: [],
      profiles,
      userIds: profiles.map((profile) => profile.user_id),
      isCheckedIn: participation.isCheckedIn,
      stadiumLiveOpen: true,
      canCheckIn: !participation.isCheckedIn,
      currentUserParticipationState: participation.isCheckedIn ? 'checked_in' : 'eligible',
    };
  }
  const { data, error } = await supabase.rpc('get_match_checkin_snapshot', {
    p_match_id: matchId,
  });

  if (error) throw safeCheckInError(error, 'load');
  return mapSnapshot(data, matchId);
}

export async function setMatchCheckInStatus({
  matchId,
  checkedIn,
}: {
  matchId: string;
  checkedIn: boolean;
}): Promise<MatchCheckInSnapshot> {
  if (isDemoMode) {
    setDemoCheckedIn(checkedIn);
    return fetchMatchCheckInSnapshot({ matchId });
  }
  const { data, error } = await supabase.rpc('set_match_checkin_status', {
    p_match_id: matchId,
    p_checked_in: checkedIn,
  });
  if (error) throw safeCheckInError(error, checkedIn ? 'check_in' : 'check_out');
  return mapSnapshot(data, matchId);
}

export async function createMatchCheckIn({
  matchId,
}: {
  matchId: string;
  userId: string;
  kickoffAt?: string | null;
}): Promise<void> {
  await setMatchCheckInStatus({ matchId, checkedIn: true });
}

export async function deleteMatchCheckIn(matchId: string): Promise<void> {
  await setMatchCheckInStatus({ matchId, checkedIn: false });
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
