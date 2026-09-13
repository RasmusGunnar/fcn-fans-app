import type { SharedMatchdayState } from '../state/matchdayStateCore';

export type CheckInPresentation = 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'UNAVAILABLE';

// Presentation only: the existing server window/permissions remain authoritative.
export function matchdayExperience(
  state: Pick<
    SharedMatchdayState,
    'loaded' | 'error' | 'stadiumLiveOpen' | 'canCheckIn' | 'isCheckedIn'
  >,
  planningAllowed: boolean,
) {
  const available = state.loaded && !state.error;
  const open = Boolean(available && state.stadiumLiveOpen && planningAllowed);
  const checkInState: CheckInPresentation = !available
    ? 'UNAVAILABLE'
    : state.isCheckedIn
      ? 'CHECKED_IN'
      : open && state.canCheckIn
        ? 'NOT_CHECKED_IN'
        : 'UNAVAILABLE';
  return {
    open,
    checkInState,
    entryLabel: checkInState === 'CHECKED_IN' ? 'Gå til kampdagen' : 'Åbn kampdagen',
    checkInLabel:
      checkInState === 'CHECKED_IN'
        ? '✓ Du er tjekket ind'
        : checkInState === 'NOT_CHECKED_IN'
          ? 'Er du på stadion?'
          : !available
            ? 'Check-in-status ikke tilgængelig'
            : open
              ? 'Check-in er ikke tilgængeligt lige nu'
              : 'Check-in er lukket',
  };
}
