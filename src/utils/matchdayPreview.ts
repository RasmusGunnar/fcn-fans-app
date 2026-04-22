export type MatchdayPreviewMode = 'off' | 'matchday' | 'checked_in';

const MATCHDAY_PREVIEW_DEV_ONLY = __DEV__;

function normalizePreviewMode(value?: string | null): MatchdayPreviewMode | null {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case 'off':
      return 'off';
    case 'matchday':
      return 'matchday';
    case 'checked_in':
    case 'checked-in':
      return 'checked_in';
    default:
      return null;
  }
}

export function getMatchdayPreviewMode(): MatchdayPreviewMode {
  if (!MATCHDAY_PREVIEW_DEV_ONLY) {
    return 'off';
  }

  const explicitMode = normalizePreviewMode(process.env.EXPO_PUBLIC_MATCHDAY_PREVIEW_MODE);
  if (explicitMode) {
    return explicitMode;
  }

  const debugFlag = process.env.EXPO_PUBLIC_MATCHDAY_DEBUG?.trim().toLowerCase();
  if (debugFlag === 'true' || debugFlag === '1') {
    return 'matchday';
  }

  const previewFlag = process.env.EXPO_PUBLIC_FORCE_MATCHDAY_PREVIEW?.trim().toLowerCase();
  return previewFlag === 'true' || previewFlag === '1' ? 'matchday' : 'off';
}

export const forceMatchdayPreview = getMatchdayPreviewMode() !== 'off';

export function isMatchdayPreviewActive(
  mode: MatchdayPreviewMode = getMatchdayPreviewMode(),
): boolean {
  return mode === 'matchday' || mode === 'checked_in';
}

export function isCheckedInPreviewActive(
  mode: MatchdayPreviewMode = getMatchdayPreviewMode(),
): boolean {
  return mode === 'checked_in';
}

export function applyMatchdayPreview<T extends { isMatchday: boolean }>(
  state: T,
  mode: MatchdayPreviewMode = getMatchdayPreviewMode(),
): T {
  return isMatchdayPreviewActive(mode) ? { ...state, isMatchday: true } : state;
}
