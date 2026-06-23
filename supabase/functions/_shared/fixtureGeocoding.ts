// deno-lint-ignore-file no-explicit-any

type SupabaseLike = {
  from: (table: string) => any;
};

type FixtureRow = Record<string, unknown>;

type CandidateSource = 'mapped_venue' | 'venue_city' | 'country_hint';

type GeocodeCandidate = {
  query: string;
  source: CandidateSource;
};

type GeocodeResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      place_name: string;
    }
  | {
      ok: false;
      reason: 'failed_no_match' | 'failed_request';
      error?: string;
    };

export type FixtureGeocodingStatus =
  | 'geocoded'
  | 'skipped_existing_coords'
  | 'skipped_no_venue'
  | 'failed_no_match'
  | 'failed_request'
  | 'failed_update';

export type FixtureGeocodingResult = {
  fixtureId: string;
  venue: string | null;
  status: FixtureGeocodingStatus;
  query?: string;
  place_name?: string;
  mapped_venue?: boolean;
  error?: string;
};

export type FixtureGeocodingSummary = {
  scanned: number;
  attempted: number;
  geocoded: number;
  mapped_venue: number;
  skipped_existing_coords: number;
  skipped_no_venue: number;
  failed_no_match: number;
  failed_request: number;
  failed_update: number;
  results: FixtureGeocodingResult[];
};

export type FixtureGeocodingOptions = {
  limit?: number;
  fetchLimit?: number;
  delayMs?: number;
  nowIso?: string;
};

const DEFAULT_LIMIT = 25;
const DEFAULT_FETCH_LIMIT = 100;
const DEFAULT_DELAY_MS = 900;
const GEOCODER_TIMEOUT_MS = 8000;
const FCN_TEAM_PROVIDER_ID = '133890';
const FCN_TEAM_NAME_MATCHERS = ['nordsjalland', 'nordsjaelland'];
const USER_AGENT = 'FCN-Fans-Fixture-Geocoding/1.0';

const VENUE_QUERY_MAPPINGS: { venues: string[]; queries: string[] }[] = [
  {
    venues: ['Br\u00f8ndby Stadion'],
    queries: ['Br\u00f8ndby Stadion, Br\u00f8ndby Stadion 30, 2605 Br\u00f8ndby, Denmark'],
  },
  {
    venues: ['Stadion im Ernesta Pohla', 'Stadion im. Ernesta Pohla', 'Arena Zabrze'],
    queries: ['Arena Zabrze, ul. F. Roosevelta 81, 41-800 Zabrze, Poland'],
  },
  {
    venues: ['Chorten Arena'],
    queries: ['Chorten Arena, ul. S\u0142oneczna 1, 15-323 Bia\u0142ystok, Poland'],
  },
  {
    venues: ['Gamla Ullevi'],
    queries: ['Gamla Ullevi, G\u00f6teborg, Sweden'],
  },
  {
    venues: ['Right to Dream Park', 'Farum Park'],
    queries: ['Right to Dream Park, Idr\u00e6tsv\u00e6nget 2, 3520 Farum, Denmark'],
  },
  {
    venues: ['Energi Viborg Arena'],
    queries: ['Viborg Stadion, Viborg, Denmark', 'Viborg Stadion, Denmark'],
  },
  {
    venues: ['Monjasa Park'],
    queries: [
      'Monjasa Park, Fredericia, Denmark',
      'Fredericia Stadion, Fredericia, Denmark',
      'Fredericia Stadion, Denmark',
    ],
  },
  {
    venues: ['Vejlby Stadion'],
    queries: [
      'Vejlby Stadion, Risskov, Denmark',
      'Vejlby Stadion, Aarhus, Denmark',
      'Vejlby, Aarhus, Denmark',
    ],
  },
];

const VENUE_QUERIES_BY_KEY = new Map<string, string[]>(
  VENUE_QUERY_MAPPINGS.flatMap((entry) =>
    entry.venues.map((venue) => [normalizeText(venue), entry.queries] as [string, string[]]),
  ),
);

function createEmptySummary(): FixtureGeocodingSummary {
  return {
    scanned: 0,
    attempted: 0,
    geocoded: 0,
    mapped_venue: 0,
    skipped_existing_coords: 0,
    skipped_no_venue: 0,
    failed_no_match: 0,
    failed_request: 0,
    failed_update: 0,
    results: [],
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00e5/g, 'a')
    .replace(/\u00e3\u00a6|\u00c3\u00a6/g, 'ae')
    .replace(/\u00e3\u00b8|\u00c3\u00b8/g, 'o')
    .replace(/\u00e3\u00a5|\u00c3\u00a5/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function readString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readRaw(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function getFixtureId(row: FixtureRow): string {
  return readString(row.id) ?? 'unknown-fixture';
}

function getVenue(row: FixtureRow): string | null {
  return readString(row.venue) ?? readString(row.venue_name);
}

function isValidCoordinatePair(row: FixtureRow): boolean {
  const lat = readNumber(row.lat);
  const lng = readNumber(row.lng);
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isFcnFixture(row: FixtureRow): boolean {
  const raw = readRaw(row.raw);
  const homeId =
    readString(row.home_team_provider_id) ??
    readString(row.home_team_id) ??
    readString(raw?.idHomeTeam);
  const awayId =
    readString(row.away_team_provider_id) ??
    readString(row.away_team_id) ??
    readString(raw?.idAwayTeam);

  if (homeId === FCN_TEAM_PROVIDER_ID || awayId === FCN_TEAM_PROVIDER_ID) return true;

  const homeTeam = normalizeText(row.home_team);
  const awayTeam = normalizeText(row.away_team);
  return FCN_TEAM_NAME_MATCHERS.some(
    (matcher) => homeTeam.includes(matcher) || awayTeam.includes(matcher),
  );
}

function isFcnHomeFixture(row: FixtureRow): boolean {
  const raw = readRaw(row.raw);
  const homeId =
    readString(row.home_team_provider_id) ??
    readString(row.home_team_id) ??
    readString(raw?.idHomeTeam);
  if (homeId === FCN_TEAM_PROVIDER_ID) return true;
  return FCN_TEAM_NAME_MATCHERS.some((matcher) => normalizeText(row.home_team).includes(matcher));
}

function buildCandidates(row: FixtureRow): {
  venue: string | null;
  candidates: GeocodeCandidate[];
  mappedVenue: boolean;
} {
  const venue = getVenue(row);
  if (!venue) return { venue: null, candidates: [], mappedVenue: false };

  const mappedQueries = VENUE_QUERIES_BY_KEY.get(normalizeText(venue)) ?? [];
  if (mappedQueries.length > 0) {
    return {
      venue,
      candidates: mappedQueries.map((query) => ({ query, source: 'mapped_venue' })),
      mappedVenue: true,
    };
  }

  const cityOrCountry = readString(row.venue_city) ?? readString(row.city);
  if (cityOrCountry) {
    return {
      venue,
      candidates: [{ query: `${venue}, ${cityOrCountry}`, source: 'venue_city' }],
      mappedVenue: false,
    };
  }

  if (isFcnHomeFixture(row)) {
    return {
      venue,
      candidates: [{ query: `${venue}, Denmark`, source: 'country_hint' }],
      mappedVenue: false,
    };
  }

  return { venue, candidates: [], mappedVenue: false };
}

async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: 'failed_request',
        error: `Geocoder returned HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, reason: 'failed_no_match' };
    }

    const first = data[0];
    const lat = readNumber(first?.lat);
    const lng = readNumber(first?.lon);
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, reason: 'failed_no_match', error: 'Invalid coordinates from geocoder' };
    }

    return {
      ok: true,
      lat,
      lng,
      place_name: readString(first?.display_name) ?? query,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'failed_request', error: 'geocode_timeout' };
    }

    return { ok: false, reason: 'failed_request', error: String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addResult(summary: FixtureGeocodingSummary, result: FixtureGeocodingResult) {
  switch (result.status) {
    case 'geocoded':
      summary.geocoded++;
      break;
    case 'skipped_existing_coords':
      summary.skipped_existing_coords++;
      break;
    case 'skipped_no_venue':
      summary.skipped_no_venue++;
      break;
    case 'failed_no_match':
      summary.failed_no_match++;
      break;
    case 'failed_request':
      summary.failed_request++;
      break;
    case 'failed_update':
      summary.failed_update++;
      break;
  }
  summary.results.push(result);
}

async function fetchUpcomingFcnFixtures(
  supabase: SupabaseLike,
  nowIso: string,
  limit: number,
  fetchLimit: number,
): Promise<{ rows: FixtureRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('*')
    .gte('kickoff_at', nowIso)
    .order('kickoff_at', { ascending: true })
    .limit(fetchLimit);

  if (error) return { rows: [], error: error.message ?? String(error) };

  const rows = Array.isArray(data) ? (data as FixtureRow[]) : [];
  return { rows: rows.filter(isFcnFixture).slice(0, limit) };
}

export async function geocodeUpcomingFcnFixtures(
  supabase: SupabaseLike,
  options: FixtureGeocodingOptions = {},
): Promise<FixtureGeocodingSummary> {
  const summary = createEmptySummary();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const fetchLimit = options.fetchLimit ?? DEFAULT_FETCH_LIMIT;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const nowIso = options.nowIso ?? new Date().toISOString();

  let fetched: { rows: FixtureRow[]; error?: string };
  try {
    fetched = await fetchUpcomingFcnFixtures(supabase, nowIso, limit, fetchLimit);
  } catch (error) {
    fetched = { rows: [], error: String(error) };
  }

  const { rows, error } = fetched;
  if (error) {
    addResult(summary, {
      fixtureId: 'fixture-query',
      venue: null,
      status: 'failed_request',
      error,
    });
    console.error('[fixture-geocoding] fetch upcoming fixtures failed:', error);
    return summary;
  }

  summary.scanned = rows.length;

  for (const row of rows) {
    const fixtureId = getFixtureId(row);
    const venue = getVenue(row);

    try {
      if (isValidCoordinatePair(row)) {
        addResult(summary, {
          fixtureId,
          venue,
          status: 'skipped_existing_coords',
        });
        continue;
      }

      const { candidates, mappedVenue } = buildCandidates(row);
      if (mappedVenue) summary.mapped_venue++;

      if (!venue) {
        addResult(summary, {
          fixtureId,
          venue: null,
          status: 'skipped_no_venue',
        });
        continue;
      }

      if (candidates.length === 0) {
        addResult(summary, {
          fixtureId,
          venue,
          status: 'failed_no_match',
          error: 'No safe geocoding query for venue without city or mapping',
        });
        continue;
      }

      summary.attempted++;
      let requestFailed = false;
      let lastError: string | undefined;
      let lastQuery: string | undefined;

      for (const candidate of candidates) {
        lastQuery = candidate.query;
        if (delayMs > 0) await wait(delayMs);

        const geocode = await geocodeAddress(candidate.query);
        if (geocode.ok === false) {
          if (geocode.reason === 'failed_request') requestFailed = true;
          lastError = geocode.error;
          continue;
        }

        const { error: updateError } = await supabase
          .from('fixtures')
          .update({
            lat: geocode.lat,
            lng: geocode.lng,
            place_name: geocode.place_name,
            geocoded_at: new Date().toISOString(),
          })
          .eq('id', fixtureId);

        if (updateError) {
          addResult(summary, {
            fixtureId,
            venue,
            status: 'failed_update',
            query: candidate.query,
            mapped_venue: candidate.source === 'mapped_venue',
            error: updateError.message ?? String(updateError),
          });
          break;
        }

        addResult(summary, {
          fixtureId,
          venue,
          status: 'geocoded',
          query: candidate.query,
          place_name: geocode.place_name,
          mapped_venue: candidate.source === 'mapped_venue',
        });
        break;
      }

      const hasTerminalResult = summary.results.some((result) => result.fixtureId === fixtureId);
      if (!hasTerminalResult) {
        addResult(summary, {
          fixtureId,
          venue,
          status: requestFailed ? 'failed_request' : 'failed_no_match',
          query: lastQuery,
          mapped_venue: mappedVenue,
          error: lastError,
        });
      }
    } catch (error) {
      addResult(summary, {
        fixtureId,
        venue,
        status: 'failed_request',
        error: String(error),
      });
    }
  }

  console.log('[fixture-geocoding] summary:', JSON.stringify(summary));
  return summary;
}
