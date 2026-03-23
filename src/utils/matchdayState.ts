const MS_PER_HOUR = 1000 * 60 * 60;

export const MATCHDAY_WINDOW_HOURS = 6;

export interface MatchdayTimingState {
  diffHours: number;
  isLive: boolean;
  isMatchday: boolean;
}

export type MatchViewState = 'pre_match' | 'matchday_action' | 'checked_in_confirmed';

export function getMatchdayTiming(kickoffAt: string, now: Date): MatchdayTimingState {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / MS_PER_HOUR;
  const isMatchday = Math.abs(diffHours) <= MATCHDAY_WINDOW_HOURS;

  return {
    diffHours,
    // We do not have final whistle data, so "live" is limited to the same matchday window.
    isLive: diffHours <= 0 && diffHours >= -MATCHDAY_WINDOW_HOURS,
    isMatchday,
  };
}

export function getMatchViewState({
  isMatchday,
  isGoing: _isGoing,
  isCheckedIn,
}: {
  isMatchday: boolean;
  isGoing: boolean;
  isCheckedIn: boolean;
}): MatchViewState {
  if (isMatchday && isCheckedIn) return 'checked_in_confirmed';
  // Matchday check-in is a separate action from RSVP state.
  if (isMatchday) return 'matchday_action';
  return 'pre_match';
}

export function canCreateMatchCheckIn(kickoffAt?: string | null, now: Date = new Date()): boolean {
  if (!kickoffAt) return false;
  return getMatchdayTiming(kickoffAt, now).isMatchday;
}
