import React from 'react';
import { View, ViewProps, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { getShadowStyle } from '../../theme/helpers/shadow';

export type CardVariant = 'default' | 'elevated' | 'subtle';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends Omit<ViewProps, 'style'> {
  variant?: CardVariant;
  padding?: CardPadding;
  style?: ViewProps['style'];
  children?: React.ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  style,
  children,
  ...props
}: CardProps) {
  const theme = useTheme();

  const paddingMap: Record<CardPadding, number> = {
    sm: theme.spacing[3],
    md: theme.components.card.padding,
    lg: theme.spacing[6],
  };

  const baseRadius = theme.components.card.borderRadius;

  let backgroundColor = theme.components.card.variants.default.backgroundColor;
  let borderWidth = theme.components.card.variants.default.borderWidth;
  let borderColor = theme.components.card.variants.default.borderColor;
  let elevationKey = theme.components.card.variants.default.elevation;

  if (variant === 'elevated') {
    backgroundColor = theme.components.card.variants.raised.backgroundColor;
    borderWidth = theme.components.card.variants.raised.borderWidth;
    borderColor = theme.components.card.variants.raised.borderColor;
    elevationKey = theme.components.card.variants.raised.elevation;
  } else if (variant === 'subtle') {
    backgroundColor = theme.colors.bg.subtle;
    borderWidth = theme.layout.borderHairline;
    borderColor = theme.colors.border.subtle;
    elevationKey = 'none';
  }

  const shadowStyle: ViewStyle | undefined =
    elevationKey !== 'none' ? getShadowStyle(theme, elevationKey) : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderRadius: baseRadius,
          borderWidth,
          borderColor,
          padding: paddingMap[padding],
        },
        shadowStyle,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
