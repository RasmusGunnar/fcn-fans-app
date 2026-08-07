import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';

export function TypingIndicator({ label }: { label: string | null }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Text variant="small" color="secondary" numberOfLines={1}>
        {label ?? ' '}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      minHeight: theme.spacing[6],
      paddingHorizontal: theme.layout.screenPadding,
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.card,
    },
  });
}
