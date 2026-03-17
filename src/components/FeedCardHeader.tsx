import React, { ReactNode } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';
import { Text } from './ui';

interface FeedCardHeaderProps {
  avatarSlot?: ReactNode; // Render prop for avatar (Avatar component or fallback)
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode; // OptionsMenu or other right-aligned content
  onPressAuthor?: () => void; // Navigate to author profile
}

/**
 * Shared header component for feed cards (posts, news, etc.)
 * Ensures consistent layout: badge → avatar → title/subtitle → menu
 */
export function FeedCardHeader({
  avatarSlot,
  title,
  subtitle,
  rightSlot,
  onPressAuthor,
}: FeedCardHeaderProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const showHeaderRow = Boolean(avatarSlot || title || subtitle || rightSlot);

  const authorContent = (
    <>
      {avatarSlot ? avatarSlot : null}
      <View style={[styles.headerInfo, !avatarSlot && styles.headerInfoNoAvatar]}>
        {!!title && (
          <Text variant="bodyBold" style={styles.title}>
            {title}
          </Text>
        )}
        {subtitle && (
          <Text variant="small" color="muted" style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {showHeaderRow && (
        <View style={styles.header}>
          <View style={styles.authorArea}>
            {onPressAuthor ? (
              <Pressable onPress={onPressAuthor} style={styles.authorContent}>
                {authorContent}
              </Pressable>
            ) : (
              <View style={styles.authorContent}>{authorContent}</View>
            )}
          </View>
          {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: theme.spacing[0],
      marginBottom: theme.spacing[1],
      gap: theme.spacing[1],
      position: 'relative',
      zIndex: 2,
      elevation: theme.elevation.sm.android,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 2,
      elevation: theme.elevation.sm.android,
    },
    headerInfo: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      marginLeft: theme.spacing[3],
    },
    headerInfoNoAvatar: {
      marginLeft: theme.spacing[0],
    },
    authorArea: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
    },
    authorContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
    },
    rightSlot: {
      marginLeft: theme.spacing[1],
      position: 'relative',
      zIndex: 3,
      elevation: theme.elevation.md.android,
      flexShrink: 0,
      alignSelf: 'center',
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
    },
    subtitle: {
      marginTop: theme.spacing[0],
      marginBottom: theme.spacing[0],
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
