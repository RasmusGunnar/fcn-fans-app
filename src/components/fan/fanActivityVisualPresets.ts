import type { ImageSourcePropType } from 'react-native';
import type { Theme } from '../../theme';

export type FanActivityVisualPresetKey = 'fanmarch' | 'bustur' | 'tifo' | 'fanbar' | 'andet';

export type FanActivityVisualPreset = {
  key: FanActivityVisualPresetKey;
  source: ImageSourcePropType;
  overlayColor: string;
  overlayOpacity: number;
  accentColor: string;
  chipBg: string;
  chipText: string;
  gridTintBg: string;
};

const sharedStadiumHero = require('../../../assets/stadium-hero.png');
const fanmarchHero = require('../../../assets/fan-activity-fanmarch.jpg');
const busturHero = require('../../../assets/fan-activity-bustur.jpg');
const tifoHero = require('../../../assets/fan-activity-tifo.jpg');
const fanbarHero = require('../../../assets/fan-activity-fanbar.jpg');
const andetHero = require('../../../assets/fan-activity-andet.jpg');

function resolvePresetKey(type: string): FanActivityVisualPresetKey {
  const normalized = type.trim().toLowerCase();

  if (
    normalized.includes('fanmarch') ||
    normalized.includes('march') ||
    normalized.includes('samling')
  ) {
    return 'fanmarch';
  }

  if (normalized.includes('bus') || normalized.includes('transport') || normalized.includes('bustur')) {
    return 'bustur';
  }

  if (normalized.includes('tifo') || normalized.includes('sang')) {
    return 'tifo';
  }

  if (
    normalized.includes('bar') ||
    normalized.includes('pub') ||
    normalized.includes('optakt') ||
    normalized.includes('mad')
  ) {
    return 'fanbar';
  }

  return 'andet';
}

export function getFanActivityVisualPreset(theme: Theme, type: string): FanActivityVisualPreset {
  const key = resolvePresetKey(type);

  switch (key) {
    case 'fanmarch':
      return {
        key,
        source: fanmarchHero || sharedStadiumHero,
        overlayColor: theme.colors.pill.yellow.bg,
        overlayOpacity: 0.24,
        accentColor: theme.colors.brand.gold,
        chipBg: theme.colors.pill.yellow.bg,
        chipText: theme.colors.pill.yellow.text,
        gridTintBg: theme.colors.pill.yellow.bg,
      };
    case 'bustur':
      return {
        key,
        source: busturHero || sharedStadiumHero,
        overlayColor: theme.colors.badges.busTripSoftBg,
        overlayOpacity: 0.28,
        accentColor: theme.colors.badges.busTrip,
        chipBg: theme.colors.pill.orange.bg,
        chipText: theme.colors.pill.orange.text,
        gridTintBg: theme.colors.pill.orange.bg,
      };
    case 'tifo':
      return {
        key,
        source: tifoHero || sharedStadiumHero,
        overlayColor: theme.colors.pill.red.bg,
        overlayOpacity: 0.2,
        accentColor: theme.colors.primary,
        chipBg: theme.colors.pill.red.bg,
        chipText: theme.colors.pill.red.text,
        gridTintBg: theme.colors.pill.red.bg,
      };
    case 'fanbar':
      return {
        key,
        source: fanbarHero || sharedStadiumHero,
        overlayColor: theme.colors.pill.orange.bg,
        overlayOpacity: 0.18,
        accentColor: theme.colors.warning,
        chipBg: theme.colors.pill.orange.bg,
        chipText: theme.colors.pill.orange.text,
        gridTintBg: theme.colors.pill.orange.bg,
      };
    case 'andet':
    default:
      return {
        key: 'andet',
        source: andetHero || sharedStadiumHero,
        overlayColor: theme.colors.pill.neutral.bg,
        overlayOpacity: 0.22,
        accentColor: theme.colors.text.secondary,
        chipBg: theme.colors.pill.neutral.bg,
        chipText: theme.colors.pill.neutral.text,
        gridTintBg: theme.colors.bg.card,
      };
  }
}
