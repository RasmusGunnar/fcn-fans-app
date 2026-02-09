// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const SPORTSDB_API_KEY = Deno.env.get('SPORTSDB_API_KEY');
const SPORTSDB_BASE_URL = Deno.env.get('SPORTSDB_BASE_URL');
const SPORTSDB_LEAGUE_ID = Deno.env.get('SPORTSDB_LEAGUE_ID');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[sync_sportsdb] Missing Supabase env vars');
}

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

function parseSeason(value: any): number | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const match = s.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function toKickoff(dateEvent: any, timeEvent: any): string | null {
  const date = String(dateEvent ?? '').trim();
  if (!date) return null;
  const time = String(timeEvent ?? '').trim();
  if (!time) {
    return new Date(`${date}T00:00:00Z`).toISOString();
  }

  const safeTime = time.includes(':') ? time : `${time}:00`;
  const iso = `${date}T${safeTime.endsWith('Z') ? safeTime : `${safeTime}Z`}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date(`${date}T00:00:00Z`).toISOString() : parsed.toISOString();
}

async function getCache(cacheKey: string) {
  const { data, error } = await supabase
    .from('api_cache')
    .select('cache_key, response_json, expires_at, status_code')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function setCache(params: {
  cache_key: string;
  endpoint: string;
  params_json: any;
  response_json: any;
  status_code: number;
  expires_at: string;
  fetched_at: string;
  rate_limit_remaining?: string | null;
  rate_limit_reset?: string | null;
}) {
  await supabase.from('api_cache').upsert(params, { onConflict: 'cache_key' });
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
    league_id: toInt(event.idLeague),
    season: parseSeason(event.strSeason),
    round: event.strRound ?? null,
    kickoff_at: toKickoff(event.dateEvent, event.strTime),
    status_short: event.strStatus ?? '',
    status_long: event.strStatus ?? '',
    elapsed: null,
    home_goals: toInt(event.intHomeScore),
    away_goals: toInt(event.intAwayScore),
    venue_name: event.strVenue ?? null,
    home_team_id: toInt(event.idHomeTeam),
    away_team_id: toInt(event.idAwayTeam),
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
      console.error('[sync_sportsdb] Upsert error:', error);
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

  if (!CRON_SECRET || req.headers.get('X-CRON-SECRET') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!SPORTSDB_API_KEY || !SPORTSDB_BASE_URL || !SPORTSDB_LEAGUE_ID) {
    return new Response('Missing SportsDB configuration', { status: 500 });
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

  const syncRun = await tryInsertSyncRun(jobName);

  try {
    let endpoint = '';
    let ttlSeconds = 0;

    if (jobName === 'fixtures_next_14_days') {
      endpoint = `/eventsnextleague.php?id=${SPORTSDB_LEAGUE_ID}`;
      ttlSeconds = 6 * 60 * 60;
    } else if (jobName === 'fixtures_recent') {
      endpoint = `/eventspastleague.php?id=${SPORTSDB_LEAGUE_ID}`;
      ttlSeconds = 60 * 60;
    } else if (jobName === 'ping') {
      endpoint = `/all_leagues.php`;
      ttlSeconds = 24 * 60 * 60;
    } else {
      return new Response('Unsupported job_name', { status: 400 });
    }

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
    console.error('[sync_sportsdb] Error:', err);
    if (syncRun?.id) {
      await tryUpdateSyncRun(syncRun.id, false, { error: String(err) });
    }
    return new Response('Sync failed', { status: 500 });
  }
});
