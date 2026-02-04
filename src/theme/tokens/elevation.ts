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
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: 2,
  },
  md: {
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: 3,
  },
  lg: {
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    android: 4,
  },
} as const;

export type ElevationLevel = keyof typeof elevation;
export type ElevationTokens = typeof elevation;
