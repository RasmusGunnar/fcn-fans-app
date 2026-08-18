import { useMatchdayState } from '../state/MatchdayStateContext';
import type { CheckInProfile } from '../services/checkins';

export interface MatchCheckInResult {
  countCheckedIn: number;
  avatars: string[];
  profiles: CheckInProfile[];
  userIds: string[];
  isCheckedIn: boolean;
  loading: boolean;
  error: string | null;
  checkIn: () => Promise<void>;
  checkOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Compatibility facade for older callers. Match screens use useMatchdayState directly;
 * this hook intentionally delegates to the same shared record instead of owning state.
 */
export function useMatchCheckIn(matchId: string, _kickoffAt?: string | null): MatchCheckInResult {
  const matchdayState = useMatchdayState(matchId);
  return {
    countCheckedIn: matchdayState.participantCount,
    avatars: matchdayState.participantAvatars,
    profiles: matchdayState.participantProfiles,
    userIds: matchdayState.participantUserIds,
    isCheckedIn: matchdayState.isCheckedIn,
    loading: matchdayState.loading,
    error: matchdayState.error,
    checkIn: matchdayState.checkIn,
    checkOut: matchdayState.checkOut,
    refresh: async () => {
      await matchdayState.refresh();
    },
  };
}
