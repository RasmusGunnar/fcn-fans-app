import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'neutral' | 'error';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export function Badge({ label, variant = 'neutral', size = 'md' }: BadgeProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'brand':
        return {
          container: { backgroundColor: theme.colors.pill.red.bg },
          text: { color: theme.colors.pill.red.text },
        };
      case 'success':
        return {
          container: { backgroundColor: theme.colors.state.success },
          text: { color: theme.colors.text.inverse },
        };
      case 'warning':
        return {
          container: { backgroundColor: theme.colors.pill.orange.bg },
          text: { color: theme.colors.pill.orange.text },
        };
      case 'error':
        return {
          container: { backgroundColor: theme.colors.state.error },
          text: { color: theme.colors.text.inverse },
        };
      default: // neutral
        return {
          container: { backgroundColor: theme.colors.pill.neutral.bg },
          text: { color: theme.colors.pill.neutral.text },
        };
    }
  };

  const getSizeStyles = (): ViewStyle => {
    if (size === 'sm') {
      return {
        paddingVertical: theme.spacing[0],
        paddingHorizontal: theme.spacing[2],
      };
    }
    return {
      paddingVertical: theme.components.pill.py,
      paddingHorizontal: theme.components.pill.px,
    };
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <View style={[styles.badge, variantStyles.container, sizeStyles]}>
      <Text style={[styles.text, variantStyles.text]}>{label}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      borderRadius: theme.components.pill.radius,
      alignSelf: 'flex-start',
    },
    text: {
      ...theme.typography.caption,
    },
  });
}
