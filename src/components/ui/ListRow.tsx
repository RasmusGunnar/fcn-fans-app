import React, { ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';
import { Text } from './Text';
import { Avatar } from './Avatar';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leftAvatar?: {
    userId?: string;
    avatarUrl?: string;
    label?: string;
  };
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightAccessory?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export function ListRow({
  title,
  subtitle,
  leftAvatar,
  leftIcon,
  rightAccessory,
  onPress,
  disabled = false,
}: ListRowProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const content = (
    <>
      {/* Left side: Avatar or Icon */}
      {leftAvatar && (
        <View style={styles.leftContainer}>
          <Avatar
            userId={leftAvatar.userId}
            avatarUrl={leftAvatar.avatarUrl}
            label={leftAvatar.label}
            size="md"
          />
        </View>
      )}
      {leftIcon && !leftAvatar && (
        <View style={styles.leftContainer}>
          <Ionicons name={leftIcon} size={24} color={theme.colors.text.secondary} />
        </View>
      )}

      {/* Middle: Title and Subtitle */}
      <View style={styles.middleContainer}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right accessory */}
      {rightAccessory && <View style={styles.rightContainer}>{rightAccessory}</View>}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.row,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      gap: theme.spacing[3],
      backgroundColor: theme.colors.bg.card,
    },
    leftContainer: {
      flexShrink: 0,
    },
    middleContainer: {
      flex: 1,
      gap: theme.spacing[1],
    },
    rightContainer: {
      flexShrink: 0,
    },
    pressed: {
      opacity: 0.7,
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
