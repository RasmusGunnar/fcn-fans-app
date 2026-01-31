export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const layout = {
  screenPadding: 16,
  cardPadding: 16,
  listGap: 12,
  borderWidth: 1,
} as const;

export type SpacingTokens = typeof spacing;
export type LayoutTokens = typeof layout;
