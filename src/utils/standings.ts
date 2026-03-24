export type StandingsRow = {
  rank?: number | null;
  teamName?: string | null;
  played?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  gf?: number | null;
  ga?: number | null;
  gd?: number | null;
  points?: number | null;
  teamId?: string | null;
  teamBadge?: string | null;
};

export type StandingsSections = {
  mode: 'single' | 'split';
  singleRows: StandingsRow[];
  championshipRows: StandingsRow[];
  relegationRows: StandingsRow[];
};

const SUPERLIGA_TEAM_COUNT = 12;
const SPLIT_PHASE_MIN_PLAYED = 23;
const PRE_SPLIT_MAX_PLAYED = 22;

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sortStandingsRows(rows: StandingsRow[]): StandingsRow[] {
  return [...rows].sort((a, b) => {
    const rankA = readNumber(a.rank);
    const rankB = readNumber(b.rank);

    if (rankA != null && rankB != null) {
      return rankA - rankB;
    }

    if (rankA != null) return -1;
    if (rankB != null) return 1;
    return 0;
  });
}

function shouldSplitStandings(rows: StandingsRow[]): boolean {
  if (rows.length !== SUPERLIGA_TEAM_COUNT) {
    return false;
  }

  const hasStableRanks = rows.every((row, index) => readNumber(row.rank) === index + 1);
  if (!hasStableRanks) {
    return false;
  }

  const playedValues = rows
    .map((row) => readNumber(row.played))
    .filter((played): played is number => played != null);

  if (playedValues.length !== SUPERLIGA_TEAM_COUNT) {
    return false;
  }

  const maxPlayed = Math.max(...playedValues);
  const minPlayed = Math.min(...playedValues);

  return maxPlayed >= SPLIT_PHASE_MIN_PLAYED && minPlayed >= PRE_SPLIT_MAX_PLAYED;
}

export function buildStandingsSections(rows: StandingsRow[]): StandingsSections {
  const sortedRows = sortStandingsRows(rows);

  if (!shouldSplitStandings(sortedRows)) {
    return {
      mode: 'single',
      singleRows: sortedRows,
      championshipRows: [],
      relegationRows: [],
    };
  }

  return {
    mode: 'split',
    singleRows: [],
    championshipRows: sortedRows.slice(0, 6),
    relegationRows: sortedRows.slice(6, 12),
  };
}
