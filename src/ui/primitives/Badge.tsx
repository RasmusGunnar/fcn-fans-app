import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
}

export function Badge({ label, tone = 'neutral', size = 'md' }: BadgeProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getToneStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (tone) {
      case 'brand':
        return {
          container: { backgroundColor: theme.colors.brand.accent },
          text: { color: theme.colors.text.inverse },
        };
      case 'success':
        return {
          container: { backgroundColor: theme.colors.state.success },
          text: { color: theme.colors.text.inverse },
        };
      case 'warning':
        return {
          container: { backgroundColor: theme.colors.state.warning },
          text: { color: theme.colors.text.inverse },
        };
      case 'danger':
        return {
          container: { backgroundColor: theme.colors.state.error },
          text: { color: theme.colors.text.inverse },
        };
      default:
        return {
          container: { backgroundColor: theme.colors.bg.subtle },
          text: { color: theme.colors.text.primary },
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

  const toneStyles = getToneStyles();
  const sizeStyles = getSizeStyles();

  return (
    <View style={[styles.badge, toneStyles.container, sizeStyles]}>
      <Text style={[styles.text, toneStyles.text]}>{label}</Text>
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
