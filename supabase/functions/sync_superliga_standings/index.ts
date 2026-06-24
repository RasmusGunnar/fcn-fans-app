// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SPORTSDB_API_KEY = Deno.env.get('SPORTSDB_API_KEY');
const SPORTSDB_LEAGUE_ID = Deno.env.get('SPORTSDB_LEAGUE_ID');
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');
const EXPECTED_SUPERLIGA_TEAM_COUNT = 12;
const SUPERLIGA_TIME_ZONE = 'Europe/Copenhagen';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[sync_superliga_standings] Missing Supabase env vars');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toInt(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getSuperligaDateParts(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SUPERLIGA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value) - 1;

  if (Number.isFinite(year) && Number.isFinite(month)) {
    return { year, month };
  }

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function currentSuperligaSeason(date = new Date()): string {
  const { year, month } = getSuperligaDateParts(date);
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function normalizeRow(row: any) {
  if (!row) return null;
  return {
    rank: toInt(row.intRank),
    teamName: row.strTeam ?? null,
    played: toInt(row.intPlayed),
    wins: toInt(row.intWin),
    draws: toInt(row.intDraw),
    losses: toInt(row.intLoss),
    gf: toInt(row.intGoalsFor),
    ga: toInt(row.intGoalsAgainst),
    gd: toInt(row.intGoalDifference),
    points: toInt(row.intPoints),
    teamId: row.idTeam ? String(row.idTeam) : null,
    teamBadge: row.strTeamBadge ?? null,
  };
}

function validateStandings(rows: ReturnType<typeof normalizeRow>[]) {
  if (rows.length !== EXPECTED_SUPERLIGA_TEAM_COUNT) {
    return {
      ok: false,
      reason: 'unexpected_row_count',
      details: {
        expectedRows: EXPECTED_SUPERLIGA_TEAM_COUNT,
        actualRows: rows.length,
      },
    };
  }

  const hasStableRanks = rows.every((row, index) => {
    if (!row) return false;
    return row.rank === index + 1 && !!row.teamName;
  });

  if (!hasStableRanks) {
    return {
      ok: false,
      reason: 'invalid_rank_or_team_name',
      details: {
        ranks: rows.map((row) => row?.rank ?? null),
        teams: rows.map((row) => row?.teamName ?? null),
      },
    };
  }

  const playedValues = rows
    .map((row) => row?.played)
    .filter((played): played is number => Number.isFinite(played));

  if (playedValues.length !== EXPECTED_SUPERLIGA_TEAM_COUNT) {
    return {
      ok: false,
      reason: 'missing_played_values',
      details: {
        expectedRows: EXPECTED_SUPERLIGA_TEAM_COUNT,
        actualPlayedValues: playedValues.length,
      },
    };
  }

  const minPlayed = Math.min(...playedValues);
  const maxPlayed = Math.max(...playedValues);
  const playedDelta = maxPlayed - minPlayed;
  if (playedDelta > 1) {
    return {
      ok: true as const,
      warning: {
        reason: 'inconsistent_played_values',
        details: {
          minPlayed,
          maxPlayed,
          playedDelta,
          playedByRank: rows.map((row) => ({
            rank: row?.rank ?? null,
            teamName: row?.teamName ?? null,
            played: row?.played ?? null,
          })),
        },
      },
    };
  }

  return { ok: true as const, warning: null };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const providedSecret = req.headers.get('x-sync-secret');
  if (!SYNC_SECRET || !providedSecret || providedSecret !== SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!SPORTSDB_API_KEY || !SPORTSDB_LEAGUE_ID) {
    return new Response('Missing SportsDB configuration', { status: 500 });
  }

  const season = currentSuperligaSeason();
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(
    SPORTSDB_API_KEY,
  )}/lookuptable.php?l=${encodeURIComponent(SPORTSDB_LEAGUE_ID)}&s=${encodeURIComponent(season)}`;

  let json: any;
  try {
    const res = await fetch(url);
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return new Response(`SportsDB error: ${res.status}`, { status: 502 });
    }
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    console.error('[sync_superliga_standings] Fetch failed', error);
    return new Response('Failed to fetch standings', { status: 502 });
  }

  const table = Array.isArray(json?.table) ? json.table : [];
  const rows = table.map(normalizeRow).filter(Boolean);
  const standingsValidation = validateStandings(rows);

  if (!standingsValidation.ok) {
    console.error('[sync_superliga_standings] Incomplete or invalid standings payload', {
      reason: standingsValidation.reason,
      ...standingsValidation.details,
      sample: rows.slice(0, 5),
      leagueId: SPORTSDB_LEAGUE_ID,
      season,
    });
    return new Response('Incomplete standings payload from SportsDB', { status: 502 });
  }

  if (standingsValidation.warning) {
    console.warn('[sync_superliga_standings] Accepting standings payload with warning', {
      reason: standingsValidation.warning.reason,
      ...standingsValidation.warning.details,
      sample: rows.slice(0, 5),
      leagueId: SPORTSDB_LEAGUE_ID,
      season,
    });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('standings_cache').upsert(
    {
      league_id: SPORTSDB_LEAGUE_ID,
      season,
      rows,
      updated_at: updatedAt,
    },
    { onConflict: 'league_id,season' },
  );

  if (error) {
    console.error('[sync_superliga_standings] Upsert error', error);
    return new Response('Failed to upsert standings', { status: 500 });
  }

  const { error: deactivateError } = await supabase
    .from('standings_cache')
    .update({ is_active: false })
    .eq('league_id', SPORTSDB_LEAGUE_ID);

  if (deactivateError) {
    console.error('[sync_superliga_standings] Failed to deactivate old standings seasons', {
      leagueId: SPORTSDB_LEAGUE_ID,
      season,
      error: deactivateError,
    });
    return new Response('Failed to update active standings season', { status: 500 });
  }

  const { error: activateError } = await supabase
    .from('standings_cache')
    .update({ is_active: true })
    .eq('league_id', SPORTSDB_LEAGUE_ID)
    .eq('season', season);

  if (activateError) {
    console.error('[sync_superliga_standings] Failed to activate current standings season', {
      leagueId: SPORTSDB_LEAGUE_ID,
      season,
      error: activateError,
    });
    return new Response('Failed to update active standings season', { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      rowCount: rows.length,
      leagueId: SPORTSDB_LEAGUE_ID,
      season,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
