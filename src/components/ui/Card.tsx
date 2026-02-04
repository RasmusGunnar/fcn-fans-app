import React from 'react';
import { View, ViewProps, StyleSheet, ImageBackground, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Theme, getShadowStyle } from '../../theme';

export interface CardProps extends Omit<ViewProps, 'style'> {
  variant?: 'default' | 'raised' | 'imageHeader' | 'feedItem' | 'hero';
  imageSource?: ImageSourcePropType;
  style?: ViewProps['style'];
  children?: React.ReactNode;
}

/**
 * Premium Stitch-style Card component
 *
 * All styling comes from theme.components.card.variants
 * Clean white cards on canvas background with soft premium shadows
 *
 * Variants:
 *   - default: Clean card with subtle border, no shadow
 *   - raised: Elevated card with soft shadow
 *   - hero: Large rounded card with premium shadow
 *   - feedItem: Flat card with bottom divider only
 *   - imageHeader: Card with image header and gradient overlay
 */
export function Card({ variant = 'default', imageSource, style, children, ...props }: CardProps) {
  const theme = useTheme();
  const variantConfig = theme.components.card.variants[variant];

  // Get shadow style based on variant elevation
  const shadowStyle =
    variantConfig.elevation !== 'none' ? getShadowStyle(theme, variantConfig.elevation) : undefined;

  // Base card style from variant config
  const baseStyle = {
    backgroundColor: variantConfig.backgroundColor,
    borderRadius: variantConfig.borderRadius,
    overflow: 'hidden' as const,
  };

  // Handle feedItem variant (bottom border only)
  if (variant === 'feedItem') {
    const feedItemConfig = variantConfig as typeof theme.components.card.variants.feedItem;
    return (
      <View
        style={[
          baseStyle,
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: feedItemConfig.borderBottomColor,
          },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  // Border style for variants that use full borders
  const borderStyle =
    'borderWidth' in variantConfig &&
    'borderColor' in variantConfig &&
    variantConfig.borderWidth > 0
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: variantConfig.borderColor,
        }
      : {};

  // Handle imageHeader variant
  if (variant === 'imageHeader' && imageSource) {
    return (
      <View style={[baseStyle, borderStyle, shadowStyle, style]} {...props}>
        <ImageBackground
          source={imageSource}
          style={createStyles(theme).imageHeader}
          resizeMode="cover"
        >
          <LinearGradient
            colors={theme.gradients.imageHeaderOverlay.colors}
            locations={theme.gradients.imageHeaderOverlay.locations}
            start={theme.gradients.imageHeaderOverlay.start}
            end={theme.gradients.imageHeaderOverlay.end}
            style={createStyles(theme).gradient}
          />
        </ImageBackground>
        <View style={{ padding: theme.components.card.padding }}>{children}</View>
      </View>
    );
  }

  // Default rendering for default/raised/hero variants
  return (
    <View
      style={[
        baseStyle,
        borderStyle,
        shadowStyle,
        { padding: theme.components.card.padding },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    imageHeader: {
      height: 200,
      width: '100%',
    },
    gradient: {
      flex: 1,
    },
  });
}
