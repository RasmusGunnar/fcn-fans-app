// Canonical V1.1B presentation contract. Identical in both clients; parity test guards drift.
// No permissions or persisted state are derived here.
export const FAN_FRESH_MS = 30 * 60 * 60 * 1000;
export const ATTENDEE_PREVIEW_SIZE = 5;
export const ATTENDEE_PAGE_SIZE = 20;

// RSVP is independent of check-in, kickoff and Stadium Live visibility.
export function matchRsvp(status: string | null | undefined) {
  const state = status === 'going' ? 'ATTENDING' : status === 'not_going' ? 'NOT_ATTENDING' : 'NOT_RESPONDED';
  return {
    state,
    attending: state === 'ATTENDING',
    notAttending: state === 'NOT_ATTENDING',
    title: state === 'ATTENDING' ? 'Du kommer' : state === 'NOT_ATTENDING' ? 'Du har meldt afbud' : 'Kommer du til kampen?',
    goingLabel: 'Jeg kommer',
    notGoingLabel: 'Kan ikke komme',
  };
}
export type MatchExperienceState = 'PRE_MATCH' | 'LIVE' | 'POST_MATCH';
export function matchExperience(
  status: string | null | undefined,
  kickoff: string,
  now = Date.now(),
) {
  const code = status?.trim().toUpperCase() ?? '';
  const live = ['1H', 'HT', '2H', 'ET', 'P', 'LIVE', 'INT'].includes(code);
  const finished = ['FT', 'AET', 'PEN'].includes(code);
  const disrupted = ['PST', 'CANC', 'ABD', 'SUSP', 'WO', 'AWD'].includes(code);
  const untilKickoff = Date.parse(kickoff) - now;
  const preLive =
    !live && !finished && !disrupted && untilKickoff > 0 && untilKickoff <= 6 * 60 * 60 * 1000;
  const state: MatchExperienceState = finished ? 'POST_MATCH' : live ? 'LIVE' : 'PRE_MATCH';
  const label = finished
    ? 'Slut'
    : code === 'HT'
      ? 'Pause'
      : code === '2H'
        ? '2. halvleg'
        : live
          ? 'Kampen er i gang'
          : code === 'PST'
            ? 'Udsat'
            : code === 'CANC'
              ? 'Aflyst'
              : disrupted
                ? 'Kampen er afbrudt'
                : untilKickoff <= 0 || !Number.isFinite(untilKickoff)
                  ? 'Afventer kampstatus'
                  : preLive
                    ? 'Kampdag · før kickoff'
                    : 'Før kampen';
  return {
    state,
    label,
    preLive,
    conversationFirst:
      state !== 'PRE_MATCH' ||
      (!disrupted && untilKickoff <= 6 * 60 * 60 * 1000 && untilKickoff >= -6 * 60 * 60 * 1000),
    planningAllowed: !finished && !disrupted,
    showScore: live || finished,
  };
}
export function weeklyFanPhase(
  awardedAt: string | null | undefined,
  now = Date.now(),
): 'fresh' | 'compact' {
  const age = now - Date.parse(awardedAt ?? '');
  return Number.isFinite(age) && age >= 0 && age < FAN_FRESH_MS ? 'fresh' : 'compact';
}
export type FanPrioritySignal = {
  award: boolean;
  kind: string;
  createdAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};
// Stable placement guard, not a second ranking/scoring algorithm.
export function placeWeeklyFan<T>(
  ranked: readonly T[],
  signal: (item: T) => FanPrioritySignal,
  now = Date.now(),
): T[] {
  const awards = ranked.filter((item) => signal(item).award);
  if (!awards.length) return [...ranked];
  const rest = ranked.filter((item) => !signal(item).award);
  let after = Math.min(3, rest.length);
  rest.forEach((item, index) => {
    const data = signal(item);
    const created = Date.parse(data.createdAt ?? '');
    const start = Date.parse(data.startsAt ?? '');
    const end = Date.parse(data.endsAt ?? '');
    const fresh = Number.isFinite(created) && created <= now && now - created < FAN_FRESH_MS;
    const relevant =
      ['match', 'event', 'fan_activity', 'bus_trip'].includes(data.kind) &&
      start <= now + 24 * 60 * 60 * 1000 &&
      (Number.isFinite(end) ? end > now : start >= now - 3 * 60 * 60 * 1000);
    if (fresh || relevant) after = Math.max(after, index + 1);
  });
  return [...rest.slice(0, after), ...awards, ...rest.slice(after)];
}
