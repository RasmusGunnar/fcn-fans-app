export const typography = {
  h1: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700' as const,
  },
  h2: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  h3: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
} as const;

export type TypographyTokens = typeof typography;
export type TypographyVariant = keyof typeof typography;
