import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';
import { Text } from './ui';
import { CategoryBadge } from '../ui/components/CategoryBadge';
import type { CategoryKey } from '../theme/categories';

interface FeedCardHeaderProps {
  categoryKey: CategoryKey;
  avatarSlot?: ReactNode; // Render prop for avatar (Avatar component or fallback)
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode; // OptionsMenu or other right-aligned content
}

/**
 * Shared header component for feed cards (posts, news, etc.)
 * Ensures consistent layout: badge → avatar → title/subtitle → menu
 */
export function FeedCardHeader({
  categoryKey,
  avatarSlot,
  title,
  subtitle,
  rightSlot,
}: FeedCardHeaderProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const showHeaderRow = Boolean(avatarSlot || title || subtitle || rightSlot);

  return (
    <View style={styles.container}>
      <CategoryBadge categoryKey={categoryKey} />
      {showHeaderRow && (
        <View style={styles.header}>
          {avatarSlot ? avatarSlot : null}
          <View style={[styles.headerInfo, !avatarSlot && styles.headerInfoNoAvatar]}>
            {!!title && (
              <Text variant="body" style={{ fontWeight: '600' }}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text variant="small" color="secondary">
                {subtitle}
              </Text>
            )}
          </View>
          {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: theme.spacing[2],
      marginBottom: theme.spacing[4],
      gap: theme.spacing[2],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerInfo: {
      flex: 1,
      marginLeft: theme.spacing[2],
    },
    headerInfoNoAvatar: {
      marginLeft: theme.spacing[0],
    },
    rightSlot: {
      marginLeft: theme.spacing[1],
    },
  });
}
