const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Captured once per app launch so relative labels and ordering are stable for a recording session.
export const DEMO_SESSION_NOW = Date.now();

export function demoMinutesAgo(minutes: number): string {
  return new Date(DEMO_SESSION_NOW - minutes * MINUTE_MS).toISOString();
}

export function demoDaysFromNow(days: number, hour = 17, minute = 0): string {
  const date = new Date(DEMO_SESSION_NOW + days * DAY_MS);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
