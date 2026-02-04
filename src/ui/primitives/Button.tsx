import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: ButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    if (variant === 'secondary') {
      return {
        container: { backgroundColor: theme.components.button.variants.secondary.bg },
        text: { color: theme.components.button.variants.secondary.text },
      };
    }
    if (variant === 'ghost') {
      return {
        container: { backgroundColor: theme.components.button.variants.ghost.bg },
        text: { color: theme.components.button.variants.ghost.text },
      };
    }
    return {
      container: { backgroundColor: theme.components.button.variants.primary.bg },
      text: { color: theme.components.button.variants.primary.text },
    };
  };

  const getSizeStyles = (): ViewStyle => {
    if (size === 'sm') {
      return {
        paddingVertical: theme.spacing[2],
        paddingHorizontal: theme.spacing[3],
      };
    }
    if (size === 'lg') {
      return {
        height: theme.components.button.size.lg.height,
        paddingVertical: theme.components.button.size.lg.py,
        paddingHorizontal: theme.components.button.size.lg.px,
      };
    }
    return {
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
    };
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variantStyles.container,
        sizeStyles,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.text, variantStyles.text]}>{title}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidth: {
      width: '100%',
    },
    text: {
      ...theme.typography.bodyBold,
    },
    pressed: {
      opacity: 0.8,
    },
    disabled: {
      backgroundColor: theme.components.button.disabled.bg,
    },
  });
}
