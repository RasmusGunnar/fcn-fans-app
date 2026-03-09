// Utility to detect compact devices (e.g., small iPhones)
import { Dimensions } from 'react-native';

export function isCompactDevice() {
  const { height, width } = Dimensions.get('window');
  // iPhone SE/8: 667, iPhone 12 mini: 780, iPhone X: 812
  return Math.min(height, width) < 700;
}
