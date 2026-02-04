export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const layout = {
  screenPadding: 16, // space.4
  cardPadding: 12, // space.3
  listGap: 8, // space.2
  borderWidth: 1,
  borderHairline: 1,
} as const;

export const border = {
  hairline: 1, // Use with StyleSheet.hairlineWidth in components
} as const;

export type SpacingTokens = typeof spacing;
export type LayoutTokens = typeof layout;
export type BorderTokens = typeof border;
