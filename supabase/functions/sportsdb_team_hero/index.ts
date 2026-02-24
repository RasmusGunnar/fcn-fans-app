import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

const SPORTSDB_BASE_DEFAULT = 'https://www.thesportsdb.com/api/v1/json';

/** Priority: fanart1 → banner → badge → null */
const HERO_FIELDS = [
  'strTeamFanart1',
  'strTeamBanner',
  'strTeamBadge',
  'strBadge',
] as const;

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('http');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get('id');

    if (!teamId) {
      return new Response(
        JSON.stringify({ error: 'Missing ?id= parameter' }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const apiKey = Deno.env.get('SPORTSDB_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SPORTSDB_API_KEY' }),
        { status: 500, headers: CORS_HEADERS },
      );
    }

    const base = (Deno.env.get('SPORTSDB_BASE_URL') || SPORTSDB_BASE_DEFAULT).replace(/\/$/, '');
    const lookupUrl = `${base}/${encodeURIComponent(apiKey)}/lookupteam.php?id=${encodeURIComponent(teamId)}`;
    console.log('[sportsdb_team_hero] fetch', lookupUrl);

    const res = await fetch(lookupUrl);
    if (!res.ok) {
      console.error('[sportsdb_team_hero] HTTP error', res.status);
      return new Response(
        JSON.stringify({ heroUrl: null }),
        { status: 200, headers: CORS_HEADERS },
      );
    }

    const data = await res.json();
    const team = data?.teams?.[0];
    if (!team) {
      console.log('[sportsdb_team_hero] no team found for id', teamId);
      return new Response(
        JSON.stringify({ heroUrl: null }),
        { status: 200, headers: CORS_HEADERS },
      );
    }

    let heroUrl: string | null = null;
    for (const key of HERO_FIELDS) {
      const val = team[key];
      if (isHttpUrl(val)) {
        heroUrl = val;
        console.log('[sportsdb_team_hero] picked', key, val);
        break;
      }
    }

    return new Response(
      JSON.stringify({ heroUrl }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error('[sportsdb_team_hero] error', err);
    return new Response(
      JSON.stringify({ heroUrl: null }),
      { status: 200, headers: CORS_HEADERS },
    );
  }
});
