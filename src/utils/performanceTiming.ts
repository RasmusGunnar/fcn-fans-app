export function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

const appPerformanceStartedAt = performanceNow();
const runtimePerformanceStartedAt =
  typeof globalThis.performance?.now === 'function' ? 0 : appPerformanceStartedAt;
const PERFORMANCE_LOGS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_PERF_LOGS?.trim().toLowerCase() === 'true';
const RENDER_LOGS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_RENDER_DEBUG?.trim().toLowerCase() === 'true';
const renderCounts = new Map<string, { total: number; itemKeys: Set<string> }>();
let renderLogTimer: ReturnType<typeof setTimeout> | null = null;
let activeRouteName = 'unknown';
let navigationAttemptCounter = 0;
let activeNavigationAttempt:
  | {
      id: number;
      source: string;
      targetRoute: string;
      startedAt: number;
    }
  | null = null;

function buildPerformancePayload(details: Record<string, unknown> = {}) {
  const now = performanceNow();
  return {
    timestamp: new Date().toISOString(),
    monotonicMs: Math.round(now),
    activeRoute: activeRouteName,
    navigationAttemptId: activeNavigationAttempt?.id ?? null,
    navigationSource: activeNavigationAttempt?.source ?? null,
    navigationTarget: activeNavigationAttempt?.targetRoute ?? null,
    sinceNavigationStartMs:
      activeNavigationAttempt == null
        ? null
        : Math.round(now - activeNavigationAttempt.startedAt),
    ...details,
  };
}

export function isPerformanceLoggingEnabled(): boolean {
  return PERFORMANCE_LOGS_ENABLED;
}

export function getAppPerformanceStartedAt(): number {
  return appPerformanceStartedAt;
}

export function getRuntimePerformanceStartedAt(): number {
  return runtimePerformanceStartedAt;
}

export function logPerformanceEvent(
  scope: string,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return;
  }

  console.log(
    `[PERF][${scope}] ${stage} ${JSON.stringify(buildPerformancePayload(details))}`,
  );
}

export function logPerformanceTiming(
  scope: string,
  stage: string,
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return;
  }

  const payload = buildPerformancePayload({
    elapsedMs: Math.round(performanceNow() - startedAt),
    ...details,
  });
  console.log(`[PERF][${scope}] ${stage} ${JSON.stringify(payload)}`);
}

export function startNavigationTiming(
  source: string,
  targetRoute: string,
  details: Record<string, unknown> = {},
): number {
  const startedAt = performanceNow();
  if (!PERFORMANCE_LOGS_ENABLED) {
    return startedAt;
  }

  activeNavigationAttempt = {
    id: ++navigationAttemptCounter,
    source,
    targetRoute,
    startedAt,
  };
  logPerformanceEvent('Navigation', 'press', {
    targetRoute,
    source,
    ...details,
  });
  return startedAt;
}

export function setPerformanceActiveRoute(routeName: string | null | undefined): void {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return;
  }

  activeRouteName = routeName || 'unknown';
}

export function getPerformanceActiveRoute(): string {
  return activeRouteName;
}

export function measurePerformanceWork<T>(
  scope: string,
  stage: string,
  work: () => T,
  details: Record<string, unknown> = {},
): T {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return work();
  }

  const startedAt = performanceNow();
  try {
    return work();
  } finally {
    logPerformanceTiming(scope, stage, startedAt, details);
  }
}

export function schedulePerformanceFrame(callback: () => void): () => void {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return () => {};
  }

  const frame = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(frame);
}

export function startJsThreadLagDetector(): () => void {
  if (!PERFORMANCE_LOGS_ENABLED) {
    return () => {};
  }

  const intervalMs = 250;
  const thresholdMs = 500;
  let expectedAt = performanceNow() + intervalMs;

  const timer = setInterval(() => {
    const now = performanceNow();
    const driftMs = now - expectedAt;
    expectedAt = now + intervalMs;

    if (driftMs > thresholdMs) {
      logPerformanceEvent('JSThreadLag', 'detected', {
        driftMs: Math.round(driftMs),
        intervalMs,
        thresholdMs,
      });
    }
  }, intervalMs);

  logPerformanceEvent('JSThreadLag', 'detector-started', {
    intervalMs,
    thresholdMs,
  });

  return () => {
    clearInterval(timer);
    logPerformanceEvent('JSThreadLag', 'detector-stopped');
  };
}

export function recordRenderCount(scope: string, itemKey: string): void {
  if (!RENDER_LOGS_ENABLED) {
    return;
  }

  const current = renderCounts.get(scope) ?? { total: 0, itemKeys: new Set<string>() };
  current.total += 1;
  current.itemKeys.add(itemKey);
  renderCounts.set(scope, current);

  if (renderLogTimer) {
    return;
  }

  renderLogTimer = setTimeout(() => {
    renderCounts.forEach((count, renderScope) => {
      console.log(
        `[PERF][Render] ${renderScope} ${JSON.stringify({
          renderCount: count.total,
          uniqueItemCount: count.itemKeys.size,
        })}`,
      );
    });
    renderCounts.clear();
    renderLogTimer = null;
  }, 1000);
}
