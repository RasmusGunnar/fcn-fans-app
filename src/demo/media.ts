export const DEMO_MEDIA_FILES = {
  warmup: 'demo-warmup-01.jpg',
  awayTrip: 'demo-away-trip-01.jpg',
  rorvigGoal: 'demo-rorvig-goal-01.jpg',
  stand: 'demo-stand-01.jpg',
  afterMatch: 'demo-after-match-01.jpg',
} as const;

export type DemoMediaFile = (typeof DEMO_MEDIA_FILES)[keyof typeof DEMO_MEDIA_FILES];

export function demoMediaUrl(file: DemoMediaFile): string {
  return `demo://${file}`;
}
