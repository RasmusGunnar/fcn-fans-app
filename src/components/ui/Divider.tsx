import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../../theme';

export interface DividerProps {
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

export function Divider({ spacing = 'md' }: DividerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const getSpacingStyles = () => {
    switch (spacing) {
      case 'none':
        return { marginVertical: theme.spacing[0] };
      case 'sm':
        return { marginVertical: theme.spacing[2] };
      case 'lg':
        return { marginVertical: theme.spacing[4] };
      default: // md
        return { marginVertical: theme.spacing[3] };
    }
  };

  return <View style={[styles.divider, getSpacingStyles()]} />;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    divider: {
      height: theme.layout.borderWidth,
      backgroundColor: theme.colors.border.default,
    },
  });
}
