export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
} as const;

export const layout = {
  screenPadding: 20, // space.5
  cardPadding: 16, // space.4
  listGap: 12, // space.3
  borderWidth: 1,
  borderHairline: 1,
} as const;

export const border = {
  hairline: 1, // Use with StyleSheet.hairlineWidth in components
} as const;

export type SpacingTokens = typeof spacing;
export type LayoutTokens = typeof layout;
export type BorderTokens = typeof border;
