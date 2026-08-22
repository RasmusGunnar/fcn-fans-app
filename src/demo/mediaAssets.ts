import { Image } from 'react-native';
import type { DemoMediaFile } from './media';

// Safe local placeholders. Replace the require targets with final licensed demo assets later.
const DEMO_ASSETS: Record<DemoMediaFile, number> = {
  'demo-warmup-01.jpg': require('../../assets/fan-activity-tifo.jpg'),
  'demo-away-trip-01.jpg': require('../../assets/fan-activity-bustur.jpg'),
  'demo-rorvig-goal-01.jpg': require('../../assets/fan-activity-fanbar.jpg'),
  'demo-stand-01.jpg': require('../../assets/stadium-hero.png'),
  'demo-after-match-01.jpg': require('../../assets/fan-activity-fanmarch.jpg'),
};

export function resolveDemoMediaAssetUri(uri: string | null): string | null {
  if (!uri?.startsWith('demo://')) return null;
  const file = uri.slice('demo://'.length) as DemoMediaFile;
  const asset = DEMO_ASSETS[file];
  if (!asset) return null;
  return Image.resolveAssetSource(asset)?.uri ?? null;
}
