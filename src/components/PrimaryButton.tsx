import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'red' | 'blue' | 'yellow' | 'outline';
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  variant = 'red',
}: PrimaryButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'blue':
        return { backgroundColor: colors.blueButton, textColor: colors.card };
      case 'yellow':
        return { backgroundColor: '#FCD34D', textColor: colors.text };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderColor: colors.border,
          borderWidth: 1,
          textColor: colors.text,
        };
      default:
        return { backgroundColor: colors.fcnRed, textColor: colors.card };
    }
  };

  const { backgroundColor, textColor, borderColor, borderWidth } = getVariantStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor, borderColor, borderWidth },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.txt, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.fcnRed,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  txt: { color: colors.card, fontSize: 16, fontWeight: '700' },
});
