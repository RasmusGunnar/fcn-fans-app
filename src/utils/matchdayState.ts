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

  return {
    diffHours,
    isLive: diffMs <= 0,
    isMatchday: diffHours <= MATCHDAY_WINDOW_HOURS,
  };
}

export function getMatchViewState({
  isMatchday,
  isGoing,
  isCheckedIn,
}: {
  isMatchday: boolean;
  isGoing: boolean;
  isCheckedIn: boolean;
}): MatchViewState {
  if (isCheckedIn) return 'checked_in_confirmed';
  if (isMatchday && isGoing) return 'matchday_action';
  return 'pre_match';
}

export function canCreateMatchCheckIn(kickoffAt?: string | null, now: Date = new Date()): boolean {
  if (!kickoffAt) return false;
  return getMatchdayTiming(kickoffAt, now).isMatchday;
}
