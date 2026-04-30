import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getFanLevelLabel } from '../../lib/fanbarometer';
import { useTheme, type Theme } from '../../theme';
import type { FanLevelKey } from '../../types/fan';
import { Card, Text } from '../ui';
import { FanLevelBadge } from './FanLevelBadge';

export type FanBarometerCompactCardProps = {
  level: FanLevelKey;
  state?: 'ready' | 'loading';
};

export function FanBarometerCompactCard({
  level,
  state = 'ready',
}: FanBarometerCompactCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Card variant="raised" style={styles.card}>
      <View style={styles.headerBlock}>
        <Text variant="bodyBold" color="primary">
          Fanstatus
        </Text>
        <Text variant="caption" color="secondary" style={styles.subtitle}>
          Aktivitet som fan
        </Text>
      </View>

      {state === 'loading' ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="body" color="secondary">
            Henter fanstatus...
          </Text>
        </View>
      ) : (
        <View style={styles.identityBlock}>
          <FanLevelBadge level={level} size="md" />
          <Text variant="body" color="primary" style={styles.levelName}>
            {getFanLevelLabel(level, 'full')}
          </Text>
        </View>
      )}
    </Card>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      gap: theme.spacing[0],
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
    },
    headerBlock: {
      gap: theme.spacing[0],
      marginBottom: theme.spacing[2],
    },
    subtitle: {
      maxWidth: '88%',
    },
    identityBlock: {
      gap: theme.spacing[1],
    },
    levelName: {
      flexShrink: 1,
      maxWidth: '100%',
    },
    loadingBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
  });
}
