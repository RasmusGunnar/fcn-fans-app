export type AppMode = 'production' | 'demo';

type AppModeEnvironment = {
  EXPO_PUBLIC_APP_MODE?: string;
};

export function resolveAppMode(environment: AppModeEnvironment): AppMode {
  return environment.EXPO_PUBLIC_APP_MODE?.trim().toLowerCase() === 'demo' ? 'demo' : 'production';
}

export const appMode: AppMode = resolveAppMode({
  EXPO_PUBLIC_APP_MODE: process.env.EXPO_PUBLIC_APP_MODE,
});
export const isDemoMode = appMode === 'demo';

export const DEMO_WRITE_BLOCK_MESSAGE =
  'BLOCKED: Production write attempted while FCN Fans is running in Demo Mode';

export function assertProductionWriteAllowed(operation: string): void {
  if (!isDemoMode) return;

  throw new Error(`${DEMO_WRITE_BLOCK_MESSAGE} (${operation})`);
}
