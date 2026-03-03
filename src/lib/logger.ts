/**
 * Development-only logger utility
 * Prevents console spam in production builds
 */

export const logger = {
  log: (...args: any[]) => {
    if (__DEV__) {
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
    if (__DEV__) {
      console.debug(...args);
    }
  },
};
