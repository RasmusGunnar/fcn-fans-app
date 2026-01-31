import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';
import { Text } from './ui';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

/**
 * Premium Stitch-style primary CTA button with large pill shape
 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  fullWidth = true,
}: PrimaryButtonProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text variant="bodyBold" style={[styles.text, disabled && styles.disabledText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      height: theme.components.button.size.lg.height,
      paddingHorizontal: theme.components.button.size.lg.px,
      borderRadius: theme.components.button.radius,
      backgroundColor: theme.components.button.variants.primary.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidth: {
      width: '100%',
    },
    text: {
      color: theme.components.button.variants.primary.text,
    },
    disabled: {
      backgroundColor: theme.components.button.disabled.bg,
    },
    disabledText: {
      color: theme.components.button.disabled.text,
    },
    pressed: {
      opacity: 0.8,
    },
  });
}
