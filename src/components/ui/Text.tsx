import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme, getTextStyle } from '../../theme';
import type { TypographyVariant } from '../../theme/tokens';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TypographyVariant;
  color?: 'primary' | 'secondary' | 'muted' | 'inverse' | 'error' | 'success';
  style?: RNTextProps['style'];
}

/**
 * Themed Text component
 *
 * DO NOT hardcode fontSize, lineHeight, fontWeight - use variant prop
 * DO NOT hardcode colors - use color prop
 *
 * Examples:
 *   <Text variant="h1" color="primary">Heading</Text>
 *   <Text variant="body" color="secondary">Body text</Text>
 *   <Text variant="caption" color="muted">Caption</Text>
 */
export function Text({ variant = 'body', color = 'primary', style, ...props }: TextProps) {
  const theme = useTheme();
  const textStyle = getTextStyle(theme, variant);

  const colorMap = {
    primary: theme.colors.text.primary,
    secondary: theme.colors.text.secondary,
    muted: theme.colors.text.muted,
    inverse: theme.colors.text.inverse,
    error: theme.colors.error,
    success: theme.colors.success,
  };

  return <RNText style={[textStyle, { color: colorMap[color] }, style]} {...props} />;
}
