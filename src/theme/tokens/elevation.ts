export const elevation = {
  none: {
    ios: {
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    android: 0,
  },
  sm: {
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    android: 2,
  },
  md: {
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
    },
    android: 3,
  },
  lg: {
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 6 },
    },
    android: 4,
  },
} as const;

export type ElevationLevel = keyof typeof elevation;
export type ElevationTokens = typeof elevation;
