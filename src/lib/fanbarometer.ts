import type { FanLevelDefinition, FanLevelKey, FanLevelLabelMode } from '../types/fan';

export const FAN_LEVELS = [
  {
    key: 'new_fan',
    level: 1,
    name: 'Ny Fan',
    fullLabel: 'Ny i fællesskabet',
    shortLabel: 'Ny Fan',
    description: 'Du er startet din rejse som en del af FCN-fællesskabet.',
    minScore: 0,
  },
  {
    key: 'community_member',
    level: 2,
    name: 'Aktiv Fan',
    fullLabel: 'En del af fællesskabet',
    shortLabel: 'Fællesskabsfan',
    description: 'Du deltager og er med til at holde fællesskabet levende.',
    minScore: 100,
  },
  {
    key: 'regular_voice',
    level: 3,
    name: 'Fast Stemme',
    fullLabel: 'En aktiv stemme i fællesskabet',
    shortLabel: 'Fast Stemme',
    description: 'Du er en tydelig stemme i fællesskabet omkring FCN.',
    minScore: 250,
  },
  {
    key: 'community_core',
    level: 4,
    name: 'Kernen',
    fullLabel: 'En del af kernen',
    shortLabel: 'Kernen',
    description: 'Du er en del af kernen, der driver fællesskabet frem.',
    minScore: 500,
  },
  {
    key: 'dedicated',
    level: 5,
    name: 'Dedikeret',
    fullLabel: 'Blandt de mest engagerede fans',
    shortLabel: 'Dedikeret',
    description: 'Dit engagement er højt, og du sætter dit præg på fællesskabet.',
    minScore: 850,
  },
  {
    key: 'top_fan',
    level: 6,
    name: 'Top Fan',
    fullLabel: 'En af de mest aktive fans',
    shortLabel: 'Top Fan',
    description: 'Du er blandt de mest engagerede fans i hele fællesskabet.',
    minScore: 1300,
  },
] as const satisfies readonly FanLevelDefinition[];

export const FAN_LEVELS_BY_KEY: Readonly<Record<FanLevelKey, FanLevelDefinition>> =
  FAN_LEVELS.reduce(
    (acc, level) => {
      acc[level.key] = level;
      return acc;
    },
    {} as Record<FanLevelKey, FanLevelDefinition>,
  );

export function getFanLevelLabel(level: FanLevelKey, mode: FanLevelLabelMode = 'full'): string {
  const definition = FAN_LEVELS_BY_KEY[level];
  return mode === 'short' ? definition.shortLabel : definition.fullLabel;
}

export function getFanLevelName(level: FanLevelKey): string {
  return FAN_LEVELS_BY_KEY[level].name;
}

export function getFanLevelDescription(level: FanLevelKey): string {
  return FAN_LEVELS_BY_KEY[level].description;
}

export function getFanLevelPosition(level: FanLevelKey): { current: number; total: number } {
  const currentIndex = FAN_LEVELS.findIndex((entry) => entry.key === level);

  return {
    current: currentIndex >= 0 ? currentIndex + 1 : 1,
    total: FAN_LEVELS.length,
  };
}

export function getNextFanLevel(level: FanLevelKey): FanLevelKey | null {
  const currentIndex = FAN_LEVELS.findIndex((entry) => entry.key === level);
  if (currentIndex < 0 || currentIndex === FAN_LEVELS.length - 1) {
    return null;
  }

  return FAN_LEVELS[currentIndex + 1].key;
}

export function getFanLevelMinimumScore(level: FanLevelKey): number {
  return FAN_LEVELS_BY_KEY[level].minScore;
}

export function getPointsBetweenFanLevels(level: FanLevelKey): number | null {
  const nextLevel = getNextFanLevel(level);
  if (!nextLevel) {
    return null;
  }

  const currentMinScore = FAN_LEVELS_BY_KEY[level].minScore;
  const nextMinScore = FAN_LEVELS_BY_KEY[nextLevel].minScore;
  return Math.max(0, nextMinScore - currentMinScore);
}
