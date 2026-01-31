import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, Theme } from '../../theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: ChipProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getStateStyles = (): { container: ViewStyle; text: TextStyle } => {
    if (selected) {
      return {
        container: {
          backgroundColor: theme.components.chip.selected.bg,
        },
        text: {
          color: theme.components.chip.selected.text,
        },
      };
    }
    return {
      container: {
        backgroundColor: theme.components.chip.unselected.bg,
        borderColor: theme.components.chip.unselected.border,
        borderWidth: theme.layout.borderWidth,
      },
      text: {
        color: theme.components.chip.unselected.text,
      },
    };
  };

  const stateStyles = getStateStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        stateStyles.container,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.text, stateStyles.text]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chip: {
      borderRadius: theme.components.chip.radius,
      height: theme.components.chip.height,
      paddingHorizontal: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
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
