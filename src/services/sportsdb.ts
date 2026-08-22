/**
 * Extract match hero image URL from the fixture.raw JSONB field.
 *
 * Tries these fields in order:
 *   strThumb → strPoster → strFanart → strFanart1 → strFanart2 → strFanart3
 *
 * Returns the first value that is a non-empty http(s) URL, or null.
 */

// ─── Team hero image via Edge Function (uses premium SPORTSDB_API_KEY) ──────

import { isDemoMode } from '../config/appMode';
import { supabaseAnonKey, supabaseUrl } from '../lib/supabase';

const HERO_FIELDS = [
  'strThumb',
  'strPoster',
  'strFanart',
  'strFanart1',
  'strFanart2',
  'strFanart3',
] as const;

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('http');
}

export function getMatchHeroUrl(
  fixture: { raw?: Record<string, unknown> | null } | null | undefined,
): string | null {
  const raw = fixture?.raw;
  if (!raw || typeof raw !== 'object') return null;

  for (const key of HERO_FIELDS) {
    const val = raw[key];
    if (isHttpUrl(val)) return val;
  }
  return null;
}

/** In-memory cache so we never re-fetch the same team in one session. */
const teamHeroCache = new Map<string, string | null>();

/**
 * Fetch the best available hero image for a team via the
 * sportsdb_team_hero Edge Function (which uses the premium API key).
 * Results are cached per session in a Map.
 */
export async function getTeamHeroImage(teamId: string): Promise<string | null> {
  if (!teamId || isDemoMode) return null;

  const cached = teamHeroCache.get(teamId);
  if (cached !== undefined) return cached;

  try {
    const fnUrl = `${supabaseUrl}/functions/v1/sportsdb_team_hero?id=${encodeURIComponent(teamId)}`;

    const res = await fetch(fnUrl, {
      headers: { apikey: supabaseAnonKey },
    });

    if (!res.ok) {
      teamHeroCache.set(teamId, null);
      return null;
    }

    const data = await res.json();
    const heroUrl: string | null = isHttpUrl(data?.heroUrl) ? data.heroUrl : null;

    teamHeroCache.set(teamId, heroUrl);
    return heroUrl;
  } catch {
    teamHeroCache.set(teamId, null);
    return null;
  }
}
