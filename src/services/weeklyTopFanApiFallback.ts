const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const WEEKLY_TOP_FAN_FALLBACK_STALENESS_DAYS = 28;

export type WeeklyTopFanFallbackCandidate = {
  week_start_date?: string | null;
};

export type WeeklyTopFanDisplaySelection<T extends WeeklyTopFanFallbackCandidate> = {
  row: T | null;
  isFallbackLatest: boolean;
  fallbackAgeDays: number | null;
  rejectionReason: 'missing_latest' | 'invalid_week_start' | 'future_week' | 'older_than_cap' | null;
};

function parseWeekStartTimestamp(weekStartDate?: string | null): number | null {
  if (typeof weekStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return null;
  }

  const timestamp = new Date(`${weekStartDate}T00:00:00.000Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getWeeklyTopFanFallbackAgeDays(
  expectedWeekStart: string,
  fallbackWeekStart?: string | null,
): number | null {
  const expectedTimestamp = parseWeekStartTimestamp(expectedWeekStart);
  const fallbackTimestamp = parseWeekStartTimestamp(fallbackWeekStart);

  if (expectedTimestamp === null || fallbackTimestamp === null) {
    return null;
  }

  return Math.round((expectedTimestamp - fallbackTimestamp) / MS_PER_DAY);
}

export function selectWeeklyTopFanDisplayRow<T extends WeeklyTopFanFallbackCandidate>({
  expectedRow,
  latestRow,
  expectedWeekStart,
  maxStalenessDays = WEEKLY_TOP_FAN_FALLBACK_STALENESS_DAYS,
}: {
  expectedRow: T | null;
  latestRow: T | null;
  expectedWeekStart: string;
  maxStalenessDays?: number;
}): WeeklyTopFanDisplaySelection<T> {
  if (expectedRow) {
    return {
      row: expectedRow,
      isFallbackLatest: false,
      fallbackAgeDays: null,
      rejectionReason: null,
    };
  }

  if (!latestRow) {
    return {
      row: null,
      isFallbackLatest: false,
      fallbackAgeDays: null,
      rejectionReason: 'missing_latest',
    };
  }

  const fallbackAgeDays = getWeeklyTopFanFallbackAgeDays(
    expectedWeekStart,
    latestRow.week_start_date,
  );

  if (fallbackAgeDays === null) {
    return {
      row: null,
      isFallbackLatest: false,
      fallbackAgeDays: null,
      rejectionReason: 'invalid_week_start',
    };
  }

  if (fallbackAgeDays < 0) {
    return {
      row: null,
      isFallbackLatest: false,
      fallbackAgeDays,
      rejectionReason: 'future_week',
    };
  }

  if (fallbackAgeDays > maxStalenessDays) {
    return {
      row: null,
      isFallbackLatest: false,
      fallbackAgeDays,
      rejectionReason: 'older_than_cap',
    };
  }

  return {
    row: latestRow,
    isFallbackLatest: true,
    fallbackAgeDays,
    rejectionReason: null,
  };
}
