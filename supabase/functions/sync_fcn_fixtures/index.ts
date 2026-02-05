// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ===== TYPES =====

type NormalizedFixture = {
  provider: string;
  provider_fixture_id: string;
  kickoff_at: string;
  competition: string | null;
  round: string | null;
  venue: string | null;
  venue_city: string | null;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  updated_at: string;
};

interface GeocodingResult {
  lat: number;
  lng: number;
  place_name: string;
}

interface GeocodingSummary {
  scanned: number;
  geocoded: number;
  skipped: number;
  failed: number;
}

// ===== PROVIDER ADAPTERS =====

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

/**
 * Fetch fixtures from API-FOOTBALL provider
 */
async function fetchFixturesFromApiFootball(
  apiKey: string,
  teamSearch: string,
): Promise<
  | { fixtures: NormalizedFixture[]; teamName?: string; teamId?: string }
  | { error: string; details?: any }
> {
  try {
    // Step 1: Resolve team ID
    console.log(`[api-football] Searching for team: ${teamSearch}`);
    const teamSearchRes = await fetch(
      `${API_FOOTBALL_BASE}/teams?search=${encodeURIComponent(teamSearch)}`,
      {
        headers: {
          'x-apisports-key': apiKey,
        },
      },
    );

    if (!teamSearchRes.ok) {
      return {
        error: 'Failed to search teams',
        details: { status: teamSearchRes.status },
      };
    }

    const raw = await teamSearchRes.text();
    console.log('[api-football] Raw response:', raw.slice(0, 2000));
    const teamSearchData = JSON.parse(raw);

    // Check for API errors (e.g., access suspended, rate limit)
    if (teamSearchData.errors && Object.keys(teamSearchData.errors).length > 0) {
      console.error('[api-football] API returned errors:', teamSearchData.errors);
      return {
        error: 'API-Football provider error',
        details: teamSearchData.errors,
      };
    }

    const teams = teamSearchData?.response || [];

    if (teams.length === 0) {
      console.log('[api-football] Team not found:', {
        search: teamSearch,
        status: teamSearchRes.status,
        rateLimitRemaining: teamSearchRes.headers.get('x-ratelimit-remaining'),
        response: raw.slice(0, 2000),
      });
      return {
        error: 'Team not found',
        details: { search: teamSearch },
      };
    }

    const fcnTeamId = teams[0].team.id;
    const fcnTeamName = teams[0].team.name;
    console.log(`[api-football] Found team ID: ${fcnTeamId} (${fcnTeamName})`);

    // Step 2: Fetch next 10 fixtures
    console.log(`[api-football] Fetching next 10 fixtures for team ${fcnTeamId}...`);
    const fixturesRes = await fetch(`${API_FOOTBALL_BASE}/fixtures?team=${fcnTeamId}&next=10`, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!fixturesRes.ok) {
      return {
        error: 'Failed to fetch fixtures',
        details: { status: fixturesRes.status },
      };
    }

    const fixturesData = await fixturesRes.json();

    // Check for API errors
    if (fixturesData.errors && Object.keys(fixturesData.errors).length > 0) {
      console.error('[api-football] API returned errors:', fixturesData.errors);
      return {
        error: 'API-Football provider error',
        details: fixturesData.errors,
      };
    }

    const fixtures = fixturesData?.response || [];
    console.log(`[api-football] Retrieved ${fixtures.length} fixtures`);

    // Step 3: Map to normalized format
    const normalized: NormalizedFixture[] = fixtures.map((f: any) => ({
      provider: 'api-football',
      provider_fixture_id: String(f.fixture.id),
      kickoff_at: f.fixture.date,
      competition: f.league?.name || null,
      round: f.league?.round || null,
      venue: f.fixture?.venue?.name || null,
      venue_city: f.fixture?.venue?.city || null,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_logo_url: f.teams.home.logo || null,
      away_logo_url: f.teams.away.logo || null,
      updated_at: new Date().toISOString(),
    }));

    return {
      fixtures: normalized,
      teamName: fcnTeamName,
      teamId: String(fcnTeamId),
    };
  } catch (err) {
    console.error('[api-football] Unexpected error:', err);
    return {
      error: 'Unexpected provider error',
      details: String(err),
    };
  }
}

/**
 * Fetch fixtures from RapidAPI provider (stub - TODO)
 */
async function fetchFixturesFromRapidApi(
  apiKey: string,
  teamSearch: string,
): Promise<
  | { fixtures: NormalizedFixture[]; teamName?: string; teamId?: string }
  | { error: string; details?: any }
> {
  console.warn('[rapidapi] Provider not yet implemented');
  return {
    error: 'RapidAPI provider not implemented',
    details: 'TODO: implement RapidAPI adapter',
  };
}

// ===== GEOCODING =====

/**
 * Geocode an address using OpenStreetMap Nominatim
 * With simple rate limiting (1 second delay)
 */
async function geocodeAddress(addressText: string): Promise<GeocodingResult | null> {
  if (!addressText || !addressText.trim()) {
    return null;
  }

  try {
    // Rate limit: wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&limit=1`;
    console.log(`[geocoding] Requesting: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FCN-Fans-Sync/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[geocoding] HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[geocoding] No results for: ${addressText}`);
      return null;
    }

    const first = data[0];
    const result: GeocodingResult = {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      place_name: first.display_name || addressText,
    };

    console.log(`[geocoding] Success: ${result.place_name}`);
    return result;
  } catch (err) {
    console.error('[geocoding] Error geocoding address:', err);
    return null;
  }
}

/**
 * Geocode fixtures that don't have lat/lng yet
 */
async function geocodeFixtures(supabase: any): Promise<GeocodingSummary> {
  console.log('[geocoding] Checking for fixtures needing geocoding...');
  const { data: fixturesNeedingGeocode, error: geocodeQueryError } = await supabase
    .from('fixtures')
    .select('id, venue, venue_city, lat, lng')
    .or('lat.is.null,lng.is.null')
    // deno-lint-ignore-file no-explicit-any
    import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const CRON_SECRET = Deno.env.get('CRON_SECRET');
    const SPORTSDB_API_KEY = Deno.env.get('SPORTSDB_API_KEY');
    const SPORTSDB_BASE_URL = Deno.env.get('SPORTSDB_BASE_URL') || 'https://www.thesportsdb.com/api/v1/json';
    const SPORTSDB_LEAGUE_ID = Deno.env.get('SPORTSDB_LEAGUE_ID') || '4340';

    const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    function stableStringify(value: any): string {
      if (value === null || typeof value !== 'object') return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
      const keys = Object.keys(value).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }

    async function sha256(input: string): Promise<string> {
      const data = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function addSeconds(date: Date, seconds: number): Date {
      return new Date(date.getTime() + seconds * 1000);
    }

    function toInt(value: any): number | null {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    function toKickoff(dateEvent: any, timeEvent: any): string | null {
      const date = String(dateEvent ?? '').trim();
      if (!date) return null;
      const time = String(timeEvent ?? '').trim();
      if (!time) return new Date(`${date}T00:00:00Z`).toISOString();

      const safeTime = time.includes(':') ? time : `${time}:00`;
      const iso = `${date}T${safeTime.endsWith('Z') ? safeTime : `${safeTime}Z`}`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? new Date(`${date}T00:00:00Z`).toISOString() : parsed.toISOString();
    }

    async function getCache(cacheKey: string) {
      try {
        const { data, error } = await supabase
          .from('api_cache')
          .select('cache_key, response_json, expires_at, status_code')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        if (error || !data) return null;
        return data;
      } catch {
        return null;
      }
    }

    async function setCache(params: {
      cache_key: string;
      endpoint: string;
      params_json: any;
      response_json: any;
      status_code: number;
      expires_at: string;
      fetched_at: string;
    }) {
      try {
        await supabase.from('api_cache').upsert(params, { onConflict: 'cache_key' });
      } catch {
        // ignore cache failures
      }
    }

    async function tryInsertSyncRun(jobName: string) {
      try {
        const { data, error } = await supabase
          .from('sync_runs')
          .insert({ job_name: jobName, started_at: new Date().toISOString(), ok: false })
          .select('id')
          .single();

        if (error || !data) return null;
        return data as { id: string };
      } catch {
        return null;
      }
    }

    async function tryUpdateSyncRun(id: string, ok: boolean, stats: any) {
      try {
        await supabase
          .from('sync_runs')
          .update({ ok, finished_at: new Date().toISOString(), stats_json: stats })
          .eq('id', id);
      } catch {
        // ignore
      }
    }

    function normalizeEvent(event: any) {
      if (!event) return null;
      const externalId = toInt(event.idEvent);
      if (!externalId) return null;

      return {
        external_id: externalId,
        kickoff_at: toKickoff(event.dateEvent, event.strTime),
        status_short: event.strStatus ?? '',
        status_long: event.strStatus ?? '',
        elapsed: null,
        home_goals: toInt(event.intHomeScore),
        away_goals: toInt(event.intAwayScore),
        raw: event,
        updated_at: new Date().toISOString(),
      };
    }

    async function upsertFixtures(rows: any[]) {
      if (!rows.length) return 0;
      const chunkSize = 200;
      let total = 0;

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('fixtures')
          .upsert(chunk, { onConflict: 'external_id' });

        if (error) {
          console.error('[sync_fcn_fixtures] Upsert error:', error);
          throw error;
        }
        total += chunk.length;
      }

      return total;
    }

    serve(async (req) => {
      if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      if (CRON_SECRET && req.headers.get('X-CRON-SECRET') !== CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response('Missing Supabase env vars', { status: 500 });
      }

      if (!SPORTSDB_API_KEY) {
        return new Response('Missing SPORTSDB_API_KEY', { status: 500 });
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return new Response('Invalid JSON body', { status: 400 });
      }

      const jobName = body?.job_name;
      if (!jobName) {
        return new Response('Missing job_name', { status: 400 });
      }

      let endpoint = '';
      let ttlSeconds = 0;

      if (jobName === 'fixtures_next_14_days') {
        endpoint = `/eventsnextleague.php?id=${SPORTSDB_LEAGUE_ID}`;
        ttlSeconds = 6 * 60 * 60;
      } else if (jobName === 'fixtures_recent') {
        endpoint = `/eventspastleague.php?id=${SPORTSDB_LEAGUE_ID}`;
        ttlSeconds = 60 * 60;
      } else {
        return new Response('Unsupported job_name', { status: 400 });
      }

      const syncRun = await tryInsertSyncRun(jobName);

      try {
        const url = `${SPORTSDB_BASE_URL}/${SPORTSDB_API_KEY}${endpoint}`;
        const paramsKey = stableStringify({ endpoint, league: SPORTSDB_LEAGUE_ID });
        const cacheKey = await sha256(`${url}|${paramsKey}`);

        const cached = await getCache(cacheKey);
        const now = new Date();
        const cachedValid = cached && new Date(cached.expires_at) > now;

        let responseJson: any;
        let statusCode = 200;
        let cacheHit = false;

        if (cachedValid) {
          responseJson = cached.response_json;
          statusCode = cached.status_code ?? 200;
          cacheHit = true;
        } else {
          const res = await fetch(url);
          statusCode = res.status;
          responseJson = await res.json();

          const fetchedAt = new Date();
          const expiresAt = addSeconds(fetchedAt, ttlSeconds);
          await setCache({
            cache_key: cacheKey,
            endpoint,
            params_json: { league_id: SPORTSDB_LEAGUE_ID },
            response_json: responseJson,
            status_code: statusCode,
            fetched_at: fetchedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
          });
        }

        const events = Array.isArray(responseJson?.events) ? responseJson.events : [];
        const normalized = events.map(normalizeEvent).filter(Boolean);

        const upserted = await upsertFixtures(normalized);
        const stats = {
          job_name: jobName,
          provider: 'thesportsdb',
          cache_hit: cacheHit,
          fetched: events.length,
          upserted,
          status_code: statusCode,
        };

        if (syncRun?.id) {
          await tryUpdateSyncRun(syncRun.id, true, stats);
        }

        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        console.error('[sync_fcn_fixtures] Error:', err);
        if (syncRun?.id) {
          await tryUpdateSyncRun(syncRun.id, false, { error: String(err) });
        }
        return new Response('Sync failed', { status: 500 });
      }
    });
