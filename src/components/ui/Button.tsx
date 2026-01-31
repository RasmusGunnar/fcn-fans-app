import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
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
    switch (variant) {
      case 'outline':
        return {
          container: {
            backgroundColor: 'transparent',
            borderColor: theme.colors.brand.accent,
            borderWidth: theme.layout.borderWidth,
          },
          text: { color: theme.colors.brand.accent },
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: theme.components.button.variants.ghost.bg,
          },
          text: { color: theme.components.button.variants.ghost.text },
        };
      default: // primary
        return {
          container: { backgroundColor: theme.components.button.variants.primary.bg },
          text: { color: theme.components.button.variants.primary.text },
        };
    }
  };

  const getSizeStyles = (): ViewStyle => {
    switch (size) {
      case 'sm':
        return {
          paddingVertical: theme.spacing[2],
          paddingHorizontal: theme.spacing[3],
        };
      case 'lg':
        return {
          paddingVertical: theme.components.button.size.lg.py,
          paddingHorizontal: theme.components.button.size.lg.px,
          height: theme.components.button.size.lg.height,
        };
      default: // md
        return {
          paddingVertical: theme.spacing[3],
          paddingHorizontal: theme.spacing[4],
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variantStyles.container,
        sizeStyles,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.txt, variantStyles.text]}>{title}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    btn: {
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidth: {
      width: '100%',
    },
    txt: {
      ...theme.typography.bodyBold,
    },
    pressed: {
      opacity: 0.8,
    },
    disabled: {
      opacity: 0.4,
    },
  });
}
