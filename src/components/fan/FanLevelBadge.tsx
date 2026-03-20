import React from 'react';
import { StyleSheet, View } from 'react-native';
import { getFanLevelLabel } from '../../lib/fanbarometer';
import { getShadowStyle, useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';
import { Text } from '../ui';
import { getFanLevelTone, ShieldIcon } from './ShieldIcon';

export type FanLevelBadgeProps = {
  level?: FanLevelKey | null;
  size?: 'sm' | 'md';
  labelMode?: 'short' | 'full';
};

export function FanLevelBadge({
  level,
  size = 'md',
  labelMode = 'short',
}: FanLevelBadgeProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const shadowStyle = getShadowStyle(theme, 'sm');

  if (!level) {
    return null;
  }

  const label = getFanLevelLabel(level, labelMode);
  const tone = getFanLevelTone(theme, level);
  const isSmall = size === 'sm';

  return (
    <View style={[styles.shell, isSmall ? styles.shellSm : styles.shellMd, shadowStyle]}>
      <ShieldIcon level={level} size={isSmall ? 'sm' : 'md'} />
      <Text
        variant={isSmall ? 'small' : 'caption'}
        color="primary"
        numberOfLines={labelMode === 'short' ? 1 : undefined}
        style={[
          styles.label,
          isSmall ? styles.labelSm : styles.labelMd,
          { color: tone.labelColor },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    shell: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.elevated,
    },
    shellSm: {
      minHeight: theme.spacing[5],
      gap: theme.spacing[1] + theme.layout.borderWidth * 2,
      paddingVertical: theme.spacing[0] + theme.layout.borderHairline,
      paddingLeft: theme.spacing[2],
      paddingRight: theme.spacing[2],
    },
    shellMd: {
      minHeight: theme.spacing[6],
      gap: theme.spacing[1] + theme.layout.borderWidth * 2,
      paddingVertical: theme.spacing[1],
      paddingLeft: theme.spacing[2],
      paddingRight: theme.spacing[3],
    },
    label: {
      fontWeight: '600',
      letterSpacing: 0.12,
      flexShrink: 1,
    },
    labelSm: {
      lineHeight: theme.typography.small.lineHeight,
    },
    labelMd: {
      lineHeight: theme.typography.caption.lineHeight,
    },
  });
}
