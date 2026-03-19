const previewFlag = process.env.EXPO_PUBLIC_FORCE_MATCHDAY_PREVIEW?.trim().toLowerCase();

export const forceMatchdayPreview = previewFlag === 'true' || previewFlag === '1';

export function applyMatchdayPreview<T extends { isMatchday: boolean }>(state: T): T {
  return forceMatchdayPreview ? { ...state, isMatchday: true } : state;
}
