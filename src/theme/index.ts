import {
  lightColors,
  darkColors,
  spacing as spacingTokens,
  layout,
  radius as radiusTokens,
  typography,
  elevation,
  gradients,
  type ColorTokens,
  type SpacingTokens,
  type LayoutTokens,
  type RadiusTokens,
  type TypographyTokens,
  type ElevationTokens,
  type GradientTokens,
} from './tokens';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: ColorTokens;
  spacing: SpacingTokens;
  layout: LayoutTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
  elevation: ElevationTokens;
  gradients: GradientTokens;
  
  // Component defaults
  components: {
    card: {
      borderRadius: number;
      padding: number;
      elevationDefault: keyof ElevationTokens;
      elevationRaised: keyof ElevationTokens;
      variants: {
        feedItem: {
          borderRadius: number;
          borderBottomWidth: number;
        };
      };
    };
    icon: {
      size: {
        sm: number;
        md: number;
        lg: number;
      };
    };
    button: {
      radius: number;
      size: {
        lg: {
          height: number;
          px: number;
          py: number;
        };
      };
      variants: {
        primary: { bg: string; text: string };
        secondary: { bg: string; text: string };
        ghost: { bg: string; text: string };
        outline: { bg: string; text: string; border: string };
      };
      disabled: { bg: string; text: string };
    };
    pill: {
      radius: number;
      px: number;
      py: number;
      variants: {
        badge: { bg: string; text: string };
        subtle: { bg: string; text: string };
        gold: { bg: string; text: string };
      };
    };
    chip: {
      radius: number;
      height: number;
      selected: { bg: string; text: string };
      unselected: { bg: string; border: string; text: string };
    };
  };
}

export function createTheme(mode: ThemeMode = 'light'): Theme {
  const colors = mode === 'light' ? lightColors : darkColors;
  
  return {
    mode,
    colors,
    spacing: spacingTokens,
    layout,
    radius: radiusTokens,
    typography,
    elevation,
    gradients,
    
    components: {
      card: {
        borderRadius: radiusTokens.lg,
        padding: layout.cardPadding,
        elevationDefault: 'sm',
        elevationRaised: 'md',
        variants: {
          feedItem: {
            borderRadius: spacingTokens[0],
            borderBottomWidth: layout.borderWidth,
          },
        },
      },
      icon: {
        size: {
          sm: spacingTokens[4],
          md: spacingTokens[6],
          lg: spacingTokens[8],
        },
      },
      button: {
        radius: radiusTokens.pill,
        size: {
          lg: {
            height: spacingTokens[12],
            px: spacingTokens[5],
            py: spacingTokens[3],
          },
        },
        variants: {
          primary: {
            bg: colors.brand.accent,
            text: colors.text.inverse,
          },
          secondary: {
            bg: colors.bg.subtle,
            text: colors.text.primary,
          },
          ghost: {
            bg: 'transparent',
            text: colors.brand.accent,
          },
          outline: {
            bg: colors.bg.default,
            text: colors.brand.accent,
            border: colors.border.default,
          },
        },
        disabled: {
          bg: colors.bg.subtle,
          text: colors.text.secondary,
        },
      },
      pill: {
        radius: radiusTokens.pill,
        px: spacingTokens[3],
        py: spacingTokens[1],
        variants: {
          badge: {
            bg: colors.brand.accent,
            text: colors.text.inverse,
          },
          subtle: {
            bg: colors.bg.subtle,
            text: colors.text.primary,
          },
          gold: {
            bg: colors.brand.gold,
            text: colors.text.inverse,
          },
        },
      },
      chip: {
        radius: radiusTokens.pill,
        height: spacingTokens[10],
        selected: {
          bg: colors.brand.accent,
          text: colors.text.inverse,
        },
        unselected: {
          bg: colors.bg.default,
          border: colors.border.default,
          text: colors.text.primary,
        },
      },
    },
  };
}

// Default theme instance
export const defaultTheme = createTheme('light');

/**
 * Hook to access the current theme.
 * For now, returns the default light theme.
 * Can be extended later to support dynamic theme switching.
 */
export function useTheme(): Theme {
  return createTheme('light');
}

// For backward compatibility with old imports
// Map old flat structure to new nested structure
export const colors = {
  fcnRed: lightColors.primary,
  fcnRedDark: lightColors.primaryDark,
  bg: lightColors.bg.default,
  card: lightColors.bg.card,
  text: lightColors.text.primary,
  subtext: lightColors.text.secondary,
  border: lightColors.border.default,
  pillBg: lightColors.pill.red.bg,
  pillText: lightColors.pill.red.text,
  blueButton: lightColors.info,
  orangePillBg: lightColors.pill.orange.bg,
  orangePillText: lightColors.pill.orange.text,
  neutralPillBg: lightColors.pill.neutral.bg,
  neutralPillText: lightColors.pill.neutral.text,
  actionRowBorder: lightColors.border.light,
  warningBg: lightColors.pill.orange.bg,
  warningText: lightColors.warning,
  error: lightColors.error,
  spotifyGreen: lightColors.spotifyGreen,
  softYellowBg: lightColors.pill.yellow.bg,
  ctaBg: lightColors.ctaBg,
};

// Backward compat for old spacing values
const spacingCompat = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

// Export merged spacing for backward compatibility
export const spacing = { ...spacingCompat } as any;

// Backward compat for old radius values
const radiusCompat = {
  sm: 12,
  md: 18,
};

// Export merged radius for backward compatibility
export const radius = { ...radiusCompat } as any;

// Export helpers
export * from './helpers';
