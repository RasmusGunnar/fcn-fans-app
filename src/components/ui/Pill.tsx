import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../theme';

interface PillProps {
  label: string;
  icon?: React.ReactNode;
  variant?: 'red' | 'blue' | 'orange' | 'neutral';
}

export function Pill({ label, icon, variant = 'red' }: PillProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'blue':
        return { backgroundColor: colors.blueButton, textColor: colors.card };
      case 'orange':
        return { backgroundColor: colors.orangePillBg, textColor: colors.orangePillText };
      case 'neutral':
        return { backgroundColor: colors.neutralPillBg, textColor: colors.neutralPillText };
      default:
        return { backgroundColor: colors.pillBg, textColor: colors.pillText };
    }
  };

  const { backgroundColor, textColor } = getVariantStyles();

  return (
    <View style={[styles.pill, { backgroundColor }]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.pillBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    color: colors.pillText,
    fontSize: 12,
    fontWeight: '600',
  },
});