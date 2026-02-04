import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';
import { Text } from './ui';

interface FeedCardHeaderProps {
  badgeText?: string;
  avatarSlot: ReactNode; // Render prop for avatar (Avatar component or fallback)
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode; // OptionsMenu or other right-aligned content
}

/**
 * Shared header component for feed cards (posts, news, etc.)
 * Ensures consistent layout: badge → avatar → title/subtitle → menu
 */
export function FeedCardHeader({ avatarSlot, title, subtitle, rightSlot }: FeedCardHeaderProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.header}>
      {avatarSlot}
      <View style={styles.headerInfo}>
        <Text variant="body" style={{ fontWeight: '600' }}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" color="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: theme.spacing[2],
      marginBottom: theme.spacing[4],
    },
    headerInfo: {
      flex: 1,
      marginLeft: theme.spacing[2],
    },
    rightSlot: {
      marginLeft: theme.spacing[1],
    },
  });
}
