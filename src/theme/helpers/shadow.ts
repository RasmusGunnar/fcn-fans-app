import { Platform, ViewStyle } from 'react-native';
import type { Theme } from '../index';
import type { ElevationLevel } from '../tokens/elevation';

/**
 * Get platform-specific shadow styles
 * iOS: shadow properties
 * Android: elevation
 */
export function getShadowStyle(theme: Theme, level: ElevationLevel): ViewStyle {
  const elevationConfig = theme.elevation[level];
  
  if (Platform.OS === 'ios') {
    return elevationConfig.ios as ViewStyle;
  }
  
  return {
    elevation: elevationConfig.android,
  };
}
