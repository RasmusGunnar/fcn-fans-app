import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../../theme';
import { Text } from './Text';

interface OutlineButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

/**
 * Premium Stitch-style outline/secondary button with large pill shape
 */
export function OutlineButton({
  title,
  onPress,
  disabled = false,
  fullWidth = true,
}: OutlineButtonProps) {
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
      backgroundColor: theme.components.button.variants.outline.bg,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.components.button.variants.outline.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidth: {
      width: '100%',
    },
    text: {
      color: theme.components.button.variants.outline.text,
    },
    disabled: {
      backgroundColor: theme.components.button.disabled.bg,
      borderColor: theme.colors.border.subtle,
    },
    disabledText: {
      color: theme.components.button.disabled.text,
    },
    pressed: {
      opacity: 0.8,
    },
  });
}
