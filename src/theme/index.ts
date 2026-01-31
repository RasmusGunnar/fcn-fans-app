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
