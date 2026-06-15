/**
 * Development-only logger utility
 * Prevents console spam in production builds
 */

const INFO_LOGS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_DEBUG_LOGS?.trim().toLowerCase() === 'true';

export const logger = {
  log: (...args: any[]) => {
    if (INFO_LOGS_ENABLED) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (__DEV__) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (__DEV__) {
      console.error(...args);
    }
  },
  debug: (...args: any[]) => {
    if (INFO_LOGS_ENABLED) {
      console.debug(...args);
    }
  },
};
