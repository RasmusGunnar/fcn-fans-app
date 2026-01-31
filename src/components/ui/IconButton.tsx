import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'filled';
  color?: string;
}

export function IconButton({
  icon,
  onPress,
  disabled = false,
  size = 'md',
  variant = 'ghost',
  color,
}: IconButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getSizeStyles = (): { iconSize: number; container: ViewStyle } => {
    switch (size) {
      case 'sm':
        return {
          iconSize: 18,
          container: {
            width: theme.spacing[8],
            height: theme.spacing[8],
          },
        };
      case 'lg':
        return {
          iconSize: 28,
          container: {
            width: theme.spacing[12],
            height: theme.spacing[12],
          },
        };
      default: // md
        return {
          iconSize: 24,
          container: {
            width: theme.spacing[10],
            height: theme.spacing[10],
          },
        };
    }
  };

  const getVariantStyles = (): ViewStyle => {
    if (variant === 'filled') {
      return {
        backgroundColor: theme.colors.bg.elevated,
      };
    }
    return {
      backgroundColor: 'transparent',
    };
  };

  const { iconSize, container: sizeContainer } = getSizeStyles();
  const variantStyles = getVariantStyles();
  const iconColor = color || theme.colors.text.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        sizeContainer,
        variantStyles,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    btn: {
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.6,
    },
    disabled: {
      opacity: 0.3,
    },
  });
}
