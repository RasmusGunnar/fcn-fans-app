import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';

export type ShieldIconSize = 'sm' | 'md' | 'lg';

export type ShieldIconProps = {
  level: FanLevelKey;
  size?: ShieldIconSize;
  style?: StyleProp<ViewStyle>;
};

type FanLevelTone = {
  iconColor: string;
  labelColor: string;
};

export function getFanLevelTone(theme: Theme, level: FanLevelKey): FanLevelTone {
  switch (level) {
    case 'new_fan':
      return {
        iconColor: theme.colors.text.muted,
        labelColor: theme.colors.text.secondary,
      };
    case 'community_member':
      return {
        iconColor: theme.colors.primary,
        labelColor: theme.colors.text.secondary,
      };
    case 'regular_voice':
      return {
        iconColor: theme.colors.primary,
        labelColor: theme.colors.primaryDark,
      };
    case 'community_core':
      return {
        iconColor: theme.colors.primaryDark,
        labelColor: theme.colors.primaryDark,
      };
    case 'dedicated':
      return {
        iconColor: theme.colors.primaryDark,
        labelColor: theme.colors.text.primary,
      };
    case 'top_fan':
      return {
        iconColor: theme.colors.brand.gold,
        labelColor: theme.colors.brand.gold,
      };
    default:
      return {
        iconColor: theme.colors.text.muted,
        labelColor: theme.colors.text.secondary,
      };
  }
}

function getIconSize(size: ShieldIconSize): number {
  if (size === 'sm') return 14;
  if (size === 'lg') return 24;
  return 18;
}

export function ShieldIcon({ level, size = 'md', style }: ShieldIconProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const tone = getFanLevelTone(theme, level);

  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name="shield-outline" size={getIconSize(size)} color={tone.iconColor} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: theme.spacing[3],
    },
  });
}
