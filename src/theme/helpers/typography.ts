import { TextStyle } from 'react-native';
import type { Theme } from '../index';
import type { TypographyVariant } from '../tokens/typography';

/**
 * Get text style for a typography variant
 */
export function getTextStyle(theme: Theme, variant: TypographyVariant): TextStyle {
  return theme.typography[variant];
}
