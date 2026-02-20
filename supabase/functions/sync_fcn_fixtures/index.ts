// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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
  home_team_provider_id: string | null;
  away_team_provider_id: string | null;
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

const SPORTSDB_BASE_DEFAULT = 'https://www.thesportsdb.com/api/v1/json';
const DEFAULT_FCN_TEAM_ID = '133890';

function toIsoKickoff(dateEvent?: string | null, strTime?: string | null): string {
  const d = (dateEvent || '').trim();
  const t = (strTime || '').trim();
  if (!d) return new Date().toISOString();
  if (t) {
    // Ensure we end with Z for UTC
    const tt = t.endsWith('Z') ? t : `${t}Z`;
    return `${d}T${tt}`;
  }
  return `${d}T00:00:00Z`;
}

function normalizeSportsDbEvents(events: any[]): NormalizedFixture[] {
  return events.map((e: any) => ({
    provider: 'sportsdb',
    provider_fixture_id: String(e.idEvent),
    kickoff_at: toIsoKickoff(e.dateEvent, e.strTime),
    competition: e.strLeague || null,
    round: e.intRound ? String(e.intRound) : e.strRound || null,
    venue: e.strVenue || null,
    venue_city: e.strCity && String(e.strCity).trim() ? String(e.strCity) : null,
    home_team: e.strHomeTeam || 'Unknown',
    away_team: e.strAwayTeam || 'Unknown',
    home_logo_url: e.strHomeTeamBadge || null,
    away_logo_url: e.strAwayTeamBadge || null,
    home_team_provider_id: e.idHomeTeam ? String(e.idHomeTeam) : null,
    away_team_provider_id: e.idAwayTeam ? String(e.idAwayTeam) : null,
    updated_at: new Date().toISOString(),
  }));
}

async function fetchSportsDbJson(
  url: string,
): Promise<{ ok: true; data: any } | { ok: false; error: any }> {
  try {
    const res = await fetch(url);
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, error: { status: res.status, body: text.slice(0, 2000) } };
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return {
        ok: false,
        error: { status: res.status, body: text.slice(0, 2000), message: 'Non-JSON response' },
      };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function uniqByProviderFixtureId(fixtures: NormalizedFixture[]): NormalizedFixture[] {
  const map = new Map<string, NormalizedFixture>();
  for (const f of fixtures) map.set(f.provider_fixture_id, f);
  return Array.from(map.values());
}

function isFcnFixture(f: NormalizedFixture, fcnTeamId: string): boolean {
  return f.home_team_provider_id === fcnTeamId || f.away_team_provider_id === fcnTeamId;
}

async function fetchSportsDbSeason(
  apiKey: string,
  leagueId: string,
  season: string,
  baseUrl: string,
) {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(apiKey)}/eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(season)}`;
  console.log('[sportsdb] season url:', url);

  const r = await fetchSportsDbJson(url);
  if (!r.ok) return { error: 'sportsdb season failed', details: r.error };

  const events = r.data?.events;
  if (!Array.isArray(events)) return { fixtures: [] as NormalizedFixture[] };

  const fixtures = normalizeSportsDbEvents(events).sort((a, b) =>
    a.kickoff_at.localeCompare(b.kickoff_at),
  );
  return { fixtures };
}

async function fetchSportsDbTeamNext(apiKey: string, teamId: string, baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(apiKey)}/eventsnext.php?id=${encodeURIComponent(teamId)}`;
  console.log('[sportsdb] team next url:', url);

  const r = await fetchSportsDbJson(url);
  if (!r.ok) return { error: 'sportsdb team next failed', details: r.error };

  const events = r.data?.events;
  if (!Array.isArray(events)) return { fixtures: [] as NormalizedFixture[] };

  const fixtures = normalizeSportsDbEvents(events);
  return { fixtures };
}

async function fetchSportsDbTeamLast(apiKey: string, teamId: string, baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/${encodeURIComponent(apiKey)}/eventslast.php?id=${encodeURIComponent(teamId)}`;
  console.log('[sportsdb] team last url:', url);

  const r = await fetchSportsDbJson(url);
  if (!r.ok) return { error: 'sportsdb team last failed', details: r.error };

  const events = r.data?.results; // eventslast returns {results:[...]}
  if (!Array.isArray(events)) return { fixtures: [] as NormalizedFixture[] };

  const fixtures = normalizeSportsDbEvents(events);
  return { fixtures };
}

// ===== GEOCODING =====
async function geocodeAddress(addressText: string): Promise<GeocodingResult | null> {
  if (!addressText || !addressText.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&limit=1`;
    const response = await fetch(url, { headers: { 'User-Agent': 'FCN-Fans-Sync/1.0' } });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      place_name: first.display_name || addressText,
    };
  } catch {
    return null;
  }
}

const VENUE_ALIASES: Record<string, string[]> = {
  'Energi Viborg Arena': ['Viborg Stadion, Viborg, Denmark', 'Viborg Stadion, Denmark'],
  'Monjasa Park': [
    'Monjasa Park, Fredericia, Denmark',
    'Fredericia Stadion, Fredericia, Denmark',
    'Fredericia Stadion, Denmark',
  ],
  'Vejlby Stadion': [
    'Vejlby Stadion, Risskov, Denmark',
    'Vejlby Stadion, Aarhus, Denmark',
    'Vejlby, Aarhus, Denmark',
  ],
};

async function geocodeFixtures(supabase: any): Promise<GeocodingSummary> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, venue, venue_city, lat, lng')
    .or('lat.is.null,lng.is.null')
    .limit(1);

  if (error || !data || data.length === 0)
    return { scanned: 0, geocoded: 0, skipped: 0, failed: 0 };

  let geocoded = 0;
  let skipped = 0;
  let failed = 0;

  for (const f of data) {
    if (!f.venue) {
      skipped++;
      continue;
    }

    // Rate-limit: delay per fixture (~800ms)
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Build candidate list
    const candidates: string[] = [];
    const aliases = VENUE_ALIASES[String(f.venue)];
    if (aliases) candidates.push(...aliases);
    if (f.venue_city) candidates.push(`${f.venue}, ${f.venue_city}, Denmark`);
    candidates.push(`${f.venue}, Denmark`);

    let geo: GeocodingResult | null = null;
    for (const candidate of candidates) {
      geo = await geocodeAddress(candidate);
      if (geo) break;
    }

    if (!geo) {
      failed++;
      continue;
    }

    const { error: uerr } = await supabase
      .from('fixtures')
      .update({
        lat: geo.lat,
        lng: geo.lng,
        place_name: geo.place_name,
        geocoded_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    if (uerr) failed++;
    else geocoded++;
  }

  return { scanned: data.length, geocoded, skipped, failed };
}

// ===== MAIN =====
type JobName =
  | 'fixtures_season'
  | 'fixtures_fcn_upcoming'
  | 'fixtures_fcn_recent'
  | 'geocode_only'
  | 'ping';

async function readBody(req: Request): Promise<{ job: JobName; season?: string }> {
  try {
    const txt = await req.text();
    if (!txt) return { job: 'fixtures_fcn_upcoming' };
    const body = JSON.parse(txt);
    const raw = (body?.job_name || 'fixtures_fcn_upcoming') as string;

    // tolerate legacy names if they exist anywhere
    const job =
      raw === 'fixtures_next_14_days'
        ? 'fixtures_fcn_upcoming'
        : raw === 'fixtures_recent'
          ? 'fixtures_fcn_recent'
          : (raw as JobName);

    const season = typeof body?.season === 'string' ? body.season : undefined;
    return { job, season };
  } catch {
    return { job: 'fixtures_fcn_upcoming' };
  }
}

serve(async (req) => {
  try {
    // Auth: ONLY x-sync-secret (Verify JWT is OFF in Supabase settings)
    const syncSecret = Deno.env.get('SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');
    if (!syncSecret || !providedSecret || providedSecret !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { job, season } = await readBody(req);
    console.log('[main] job=', job, 'season=', season);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sportsDbKey = Deno.env.get('SPORTSDB_API_KEY');
    const leagueId = Deno.env.get('SPORTSDB_LEAGUE_ID') || '4340';
    const baseUrl = (Deno.env.get('SPORTSDB_BASE_URL') || SPORTSDB_BASE_DEFAULT).replace(/\/$/, '');
    const fcnTeamId = Deno.env.get('SPORTSDB_FCN_TEAM_ID') || DEFAULT_FCN_TEAM_ID;
    const seasonValue = season || Deno.env.get('SPORTSDB_SEASON') || '2025-2026';

    if (!sportsDbKey) {
      return new Response(JSON.stringify({ error: 'Missing SPORTSDB_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (job === 'ping') {
      return new Response(JSON.stringify({ success: true, time: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (job === 'geocode_only') {
      const geocoding = await geocodeFixtures(supabase);
      return new Response(JSON.stringify({ success: true, mode: 'geocode-only', geocoding }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch logic
    let fixtures: NormalizedFixture[] = [];
    const nowIso = new Date().toISOString();

    if (job === 'fixtures_season') {
      const r = await fetchSportsDbSeason(sportsDbKey, leagueId, seasonValue, baseUrl);
      if ('error' in r)
        return new Response(JSON.stringify({ error: r.error, details: r.details }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      fixtures = r.fixtures;
    }

    if (job === 'fixtures_fcn_upcoming') {
      const seasonRes = await fetchSportsDbSeason(sportsDbKey, leagueId, seasonValue, baseUrl);
      if (!('error' in seasonRes)) fixtures.push(...seasonRes.fixtures);

      const nextRes = await fetchSportsDbTeamNext(sportsDbKey, fcnTeamId, baseUrl);
      if (!('error' in nextRes)) fixtures.push(...nextRes.fixtures);

      fixtures = uniqByProviderFixtureId(fixtures)
        .filter((f) => isFcnFixture(f, fcnTeamId))
        .filter((f) => f.kickoff_at >= nowIso)
        .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
    }

    if (job === 'fixtures_fcn_recent') {
      const lastRes = await fetchSportsDbTeamLast(sportsDbKey, fcnTeamId, baseUrl);
      if ('error' in lastRes)
        return new Response(JSON.stringify({ error: lastRes.error, details: lastRes.details }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });

      fixtures = lastRes.fixtures
        .filter((f) => isFcnFixture(f, fcnTeamId))
        .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));
    }

    const fetched = fixtures.length;

    const { data, error } = await supabase
      .from('fixtures')
      .upsert(fixtures, { onConflict: 'provider_fixture_id' })
      .select();

    if (error) {
      console.error('[db] upsert error:', error);
      return new Response(
        JSON.stringify({ error: 'Database upsert failed', db_error: error, fetched }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const geocoding = { scanned: 0, geocoded: 0, skipped: 0, failed: 0 };

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'full-sync',
        job,
        provider: 'sportsdb',
        season: seasonValue,
        fetched,
        synced: data?.length || 0,
        geocoding,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (e) {
    console.error('[main] unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
