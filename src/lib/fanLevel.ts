import type { FanLevelKey } from '../types/fan';

export const DEFAULT_FAN_LEVEL_KEY: FanLevelKey = 'new_fan';

export function isFanLevelKey(value: unknown): value is FanLevelKey {
  return (
    value === 'new_fan' ||
    value === 'community_member' ||
    value === 'regular_voice' ||
    value === 'community_core' ||
    value === 'dedicated' ||
    value === 'top_fan'
  );
}

export function getSafeFanLevelKey(
  value: unknown,
  fallback: FanLevelKey = DEFAULT_FAN_LEVEL_KEY,
): FanLevelKey {
  return isFanLevelKey(value) ? value : fallback;
}
