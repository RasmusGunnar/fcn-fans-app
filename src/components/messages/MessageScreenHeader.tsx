import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../Avatar';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';
import type { MessagePeer } from '../../types/messages';

type MessageScreenHeaderProps = {
  title: string;
  peer?: MessagePeer | null;
  onBack: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
};

export function MessageScreenHeader({
  title,
  peer,
  onBack,
  rightIcon,
  onRightPress,
  rightAccessibilityLabel,
}: MessageScreenHeaderProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.iconButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
          hitSlop={theme.spacing[2]}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text.inverse} />
        </Pressable>
        <View style={styles.titleRow}>
          {peer ? (
            <Avatar
              userId={peer.id}
              avatarUrl={peer.avatarUrl}
              label={peer.displayName}
              size={theme.spacing[8]}
            />
          ) : null}
          <Text variant="h3" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
        {rightIcon && onRightPress ? (
          <Pressable
            style={styles.iconButton}
            onPress={onRightPress}
            accessibilityRole="button"
            accessibilityLabel={rightAccessibilityLabel ?? title}
            hitSlop={theme.spacing[2]}
          >
            <Ionicons name={rightIcon} size={22} color={theme.colors.text.inverse} />
          </Pressable>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: theme.colors.primary,
    },
    header: {
      minHeight: theme.spacing[12],
      paddingHorizontal: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    title: {
      flex: 1,
      color: theme.colors.text.inverse,
    },
  });
}
