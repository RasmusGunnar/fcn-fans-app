// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY');
const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_HOST');
const API_FOOTBALL_BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[sync_api_football] Missing Supabase env vars');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JobRow = {
  id: string;
  job_name: string;
  disabled?: boolean | null;
  job_params?: Record<string, any> | null;
};

type CacheRow = {
  cache_key: string;
  response_json: any;
  expires_at: string;
  status_code?: number | null;
};

type SyncRunRow = {
  id: string;
};

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

function toDateOnly(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchWithRetry(url: string, headers: HeadersInit, maxRetries: number) {
  let attempt = 0;
  let lastError: any;

  while (attempt <= maxRetries) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res;

    lastError = new Error('Rate limited');
    const backoffMs = Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    attempt += 1;
  }

  throw lastError ?? new Error('Rate limited');
}

async function getCache(cacheKey: string): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from('api_cache')
    .select('cache_key, response_json, expires_at, status_code')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;
  return data as CacheRow;
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

function normalizeFixture(item: any) {
  const fixture = item?.fixture ?? {};
  const league = item?.league ?? {};
  const goals = item?.goals ?? {};
  const status = fixture?.status ?? {};

  const externalId = fixture?.id ?? item?.id ?? null;
  if (!externalId) return null;

  return {
    external_id: String(externalId),
    league_id: league?.id ?? null,
    season: league?.season ?? null,
    round: league?.round ?? null,
    kickoff_at: fixture?.date ?? null,
    status_short: status?.short ?? null,
    status_long: status?.long ?? null,
    elapsed: status?.elapsed ?? null,
    home_goals: goals?.home ?? null,
    away_goals: goals?.away ?? null,
    venue_name: fixture?.venue?.name ?? null,
    raw: item ?? null,
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
      console.error('[sync_api_football] Upsert error:', error);
      throw error;
    }
    total += chunk.length;
  }

  return total;
}

async function insertSyncRun(jobName: string) {
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({ job_name: jobName, started_at: new Date().toISOString(), ok: false })
    .select('id')
    .single();

  if (error || !data) return null;
  return data as SyncRunRow;
}

async function updateSyncRun(id: string, ok: boolean, stats: any) {
  await supabase
    .from('sync_runs')
    .update({ ok, finished_at: new Date().toISOString(), stats_json: stats })
    .eq('id', id);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!CRON_SECRET || req.headers.get('X-CRON-SECRET') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST || !API_FOOTBALL_BASE_URL) {
    return new Response('Missing RapidAPI configuration', { status: 500 });
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

  const { data: job, error: jobError } = await supabase
    .from('sync_jobs')
    .select('id, job_name, disabled, job_params')
    .eq('job_name', jobName)
    .maybeSingle();

  if (jobError || !job) {
    return new Response('Unknown job', { status: 400 });
  }

  if (job.disabled) {
    return new Response('Job disabled', { status: 400 });
  }

  const syncRun = await insertSyncRun(jobName);

  try {
    const jobParams = (job.job_params ?? {}) as Record<string, any>;
    const headers = {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    };

    let endpoint = '/fixtures';
    let params: Record<string, string> = {};
    let ttlSeconds = 3600;

    if (jobName === 'fixtures_next_14_days') {
      const daysAhead = Number(jobParams.days_ahead ?? 14);
      const leagueId = String(jobParams.league_id ?? 119); // TODO: replace with config
      const season = String(jobParams.season ?? new Date().getFullYear());
      const from = toDateOnly(new Date());
      const to = toDateOnly(addSeconds(new Date(), daysAhead * 24 * 60 * 60));

      params = { league: leagueId, season, from, to };
      ttlSeconds = 60 * 60;
    } else if (jobName === 'fixtures_live') {
      params = { live: 'all' };
      ttlSeconds = 45;
    } else {
      throw new Error('Unsupported job_name');
    }

    const paramsString = stableStringify(params);
    const cacheKey = await sha256(`${endpoint}|${paramsString}`);

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
      const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

      const res = await fetchWithRetry(url.toString(), headers, 2);
      statusCode = res.status;
      responseJson = await res.json();

      const fetchedAt = new Date();
      const expiresAt = addSeconds(fetchedAt, ttlSeconds);
      await setCache({
        cache_key: cacheKey,
        endpoint,
        params_json: params,
        response_json: responseJson,
        status_code: statusCode,
        fetched_at: fetchedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        rate_limit_remaining: res.headers.get('x-ratelimit-remaining'),
        rate_limit_reset: res.headers.get('x-ratelimit-reset'),
      });
    }

    const fixtures = Array.isArray(responseJson?.response) ? responseJson.response : [];
    const normalized = fixtures.map(normalizeFixture).filter(Boolean);

    const upserted = await upsertFixtures(normalized);
    const stats = {
      job_name: jobName,
      provider: 'rapidapi',
      cache_hit: cacheHit,
      fetched: fixtures.length,
      upserted,
      status_code: statusCode,
    };

    if (syncRun?.id) {
      await updateSyncRun(syncRun.id, true, stats);
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[sync_api_football] Error:', err);
    if (syncRun?.id) {
      await updateSyncRun(syncRun.id, false, { error: String(err) });
    }
    return new Response('Sync failed', { status: 500 });
  }
});
