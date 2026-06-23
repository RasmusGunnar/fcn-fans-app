// deno-lint-ignore-file no-explicit-any
/**
 * sync-fixtures — Fetch FCN season schedule from TheSportsDB V1 and upsert
 * into the `fixtures` table so the app has upcoming matches.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   THESPORTSDB_API_KEY  (free tier default "3")
 *
 * Can be invoked from the app by authenticated app admins.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { geocodeUpcomingFcnFixtures } from '../_shared/fixtureGeocoding.ts';

// ── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SPORTSDB_KEY = Deno.env.get('THESPORTSDB_API_KEY') ?? '3';

// TheSportsDB constants
const LEAGUE_ID = '4340'; // Danish Superliga
const FCN_TEAM_ID = '133890'; // FC Nordsjælland

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build season string: Jul-Dec → "2025-2026", Jan-Jun → "2024-2025" */
function currentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** Parse TheSportsDB dateEvent + strTime into ISO kickoff string. */
function toKickoff(dateEvent: string | null, strTime: string | null): string | null {
  const d = String(dateEvent ?? '').trim();
  if (!d) return null;
  const t = String(strTime ?? '').trim();
  if (!t) return new Date(`${d}T00:00:00Z`).toISOString();

  const safe = t.includes(':') ? t : `${t}:00`;
  const iso = `${d}T${safe.endsWith('Z') ? safe : `${safe}Z`}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? new Date(`${d}T00:00:00Z`).toISOString()
    : parsed.toISOString();
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[MatchSync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bearerToken = getBearerToken(req);

  if (!bearerToken) {
    console.warn('[MatchSync] Missing authorization bearer token');
    return json({ error: 'Unauthorized' }, 401);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(bearerToken);

  if (userError || !user?.id) {
    console.warn('[MatchSync] Invalid authorization bearer token', userError?.message ?? null);
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: adminRow, error: adminError } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) {
    console.error('[MatchSync] Admin check failed:', adminError.message);
    return json({ error: 'Admin check failed' }, 500);
  }

  if (!adminRow) {
    console.warn('[MatchSync] Non-admin sync attempt blocked:', user.id);
    return json({ error: 'Forbidden' }, 403);
  }

  const season = currentSeason();
  console.log(`[MatchSync] Starting sync — season ${season}, key "${SPORTSDB_KEY}"`);

  // 1. Fetch season schedule from TheSportsDB V1
  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/eventsseason.php?id=${LEAGUE_ID}&s=${season}`;
  console.log(`[MatchSync] GET ${url}`);

  let events: any[];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`[MatchSync] API returned ${res.status}: ${body.slice(0, 500)}`);
      return json({ error: 'TheSportsDB request failed', status: res.status }, 502);
    }
    const data = await res.json();
    events = Array.isArray(data?.events) ? data.events : [];
  } catch (err) {
    console.error('[MatchSync] Fetch error:', err);
    return json({ error: 'Network error', details: String(err) }, 502);
  }

  console.log(`[MatchSync] Fetched ${events.length} events for league ${LEAGUE_ID}`);

  // 2. Filter for FCN matches
  const fcnEvents = events.filter(
    (e: any) => String(e.idHomeTeam) === FCN_TEAM_ID || String(e.idAwayTeam) === FCN_TEAM_ID,
  );
  console.log(`[MatchSync] ${fcnEvents.length} FCN matches in season`);

  // 3. Filter only future matches (allow 2h lookback so in-progress matches still show)
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const upcoming = fcnEvents.filter((e: any) => {
    const ko = toKickoff(e.dateEvent, e.strTime);
    return ko && ko >= cutoff;
  });
  console.log(`[MatchSync] ${upcoming.length} upcoming (after cutoff ${cutoff})`);

  if (upcoming.length === 0) {
    const geocoding = await geocodeUpcomingFcnFixtures(supabase, { limit: 25 });
    return json({
      season,
      fetched: events.length,
      filtered: fcnEvents.length,
      upserted: 0,
      skipped_reason: 'No upcoming FCN matches found in season schedule',
      geocoding,
    });
  }

  // 4. Map to fixtures table columns
  const rows = upcoming.map((e: any) => ({
    provider: 'thesportsdb',
    provider_fixture_id: `sportsdb:${e.idEvent}`,
    kickoff_at: toKickoff(e.dateEvent, e.strTime),
    home_team: e.strHomeTeam ?? 'Ukendt',
    away_team: e.strAwayTeam ?? 'Ukendt',
    competition: e.strLeague ?? null,
    round: e.intRound ? `Round ${e.intRound}` : (e.strRound ?? null),
    venue: e.strVenue ?? null,
    venue_city: e.strCity ?? e.strCountry ?? null,
    home_logo_url: e.strHomeTeamBadge ?? null,
    away_logo_url: e.strAwayTeamBadge ?? null,
    updated_at: new Date().toISOString(),
  }));

  // 5. Upsert — ON CONFLICT (provider_fixture_id) to avoid duplicates
  let upserted = 0;
  const chunkSize = 100;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('fixtures')
      .upsert(chunk, { onConflict: 'provider_fixture_id' });

    if (error) {
      console.error('[MatchSync] Upsert error:', error.message);
      errors.push(error.message);
    } else {
      upserted += chunk.length;
    }
  }

  console.log(`[MatchSync] Done — upserted ${upserted}/${rows.length}`);
  const geocoding = await geocodeUpcomingFcnFixtures(supabase, { limit: 25 });

  const result = {
    season,
    fetched: events.length,
    filtered: fcnEvents.length,
    upserted,
    geocoding,
    ...(errors.length > 0 ? { errors } : {}),
  };

  return json(result, errors.length > 0 ? 207 : 200);
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
