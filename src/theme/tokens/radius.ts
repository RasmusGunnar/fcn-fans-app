export const radius = {
  none: 0,
  sm: 6,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export type RadiusTokens = typeof radius;
