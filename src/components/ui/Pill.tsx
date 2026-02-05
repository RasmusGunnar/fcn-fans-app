import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

interface PillProps {
  label: string;
  icon?: React.ReactNode;
  variant?: 'badge' | 'subtle' | 'gold';
}

export function Pill({ label, icon, variant = 'badge' }: PillProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (variant) {
      case 'subtle':
        return {
          container: { backgroundColor: theme.components.pill.variants.subtle.bg },
          text: { color: theme.components.pill.variants.subtle.text },
        };
      case 'gold':
        return {
          container: { backgroundColor: theme.components.pill.variants.gold.bg },
          text: { color: theme.components.pill.variants.gold.text },
        };
      default: // badge
        return {
          container: { backgroundColor: theme.components.pill.variants.badge.bg },
          text: {
            color: theme.components.pill.variants.badge.text,
            textTransform: 'uppercase' as const,
          },
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <View style={[styles.pill, variantStyles.container]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[styles.text, variantStyles.text]}>{label}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    pill: {
      borderRadius: theme.components.pill.radius,
      paddingVertical: theme.components.pill.py,
      paddingHorizontal: theme.components.pill.px,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
    },
    icon: {
      marginRight: theme.spacing[1],
    },
    text: {
      ...theme.typography.caption,
      fontWeight: '600',
    },
  });
}
