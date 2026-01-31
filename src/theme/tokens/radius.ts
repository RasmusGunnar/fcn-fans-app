export const radius = {
  none: 0,
  sm: 4,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export type RadiusTokens = typeof radius;
