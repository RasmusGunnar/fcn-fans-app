import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

// Type matching Supabase fixtures table
export interface Fixture {
  id: string;
  provider: string;
  provider_fixture_id: string;
  kickoff_at: string; // ISO timestamp
  competition: string | null;
  round: string | null;
  venue: string | null;
  venue_city: string | null;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  created_at: string;
  updated_at: string;
  // Provider team IDs (for hero images etc.)
  home_team_provider_id?: string | null;
  away_team_provider_id?: string | null;
  // Location/geocoding fields
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
  geocoded_at?: string | null;
  // SportsDB raw JSON (for hero images etc.)
  raw?: Record<string, unknown> | null;
}

const FCN_FIXTURES_VIEW = 'v_fcn_fixtures';
const FCN_TEAM_FILTER = '%nordsjælland%';

function shouldFallbackView(error: any): boolean {
  const message = String(error?.message ?? '');
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('relation');
}

function applyFcnFilter(query: any) {
  return query.or(`home_team.ilike.${FCN_TEAM_FILTER},away_team.ilike.${FCN_TEAM_FILTER}`);
}

export async function fetchUpcomingFcntFixtures(limit = 30): Promise<Fixture[]> {
  try {
    const { data, error } = await supabase
      .from(FCN_FIXTURES_VIEW)
      .select('*')
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(limit);

    if (error && shouldFallbackView(error)) {
      const fallback = await applyFcnFilter(supabase.from('fixtures').select('*'))
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(limit);

      if (fallback.error) {
        logger.error('[fixtures] Error fetching FCN upcoming fixtures (fallback):', fallback.error);
        return [];
      }

      return fallback.data || [];
    }

    if (error) {
      logger.error('[fixtures] Error fetching FCN upcoming fixtures:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('[fixtures] Unexpected error fetching FCN upcoming fixtures:', err);
    return [];
  }
}

/**
 * Fetch upcoming fixtures from Supabase, sorted by kickoff time
 */
export async function fetchUpcomingFixtures(limitCount = 50): Promise<Fixture[]> {
  try {
    const { data, error } = await supabase
      .from(FCN_FIXTURES_VIEW)
      .select('*')
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(limitCount);

    if (error && shouldFallbackView(error)) {
      const fallback = await applyFcnFilter(supabase.from('fixtures').select('*'))
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(limitCount);

      if (fallback.error) {
        logger.error('[fixtures] Error fetching upcoming fixtures (fallback):', fallback.error);
        return [];
      }

      return fallback.data || [];
    }

    if (error) {
      logger.error('[fixtures] Error fetching upcoming fixtures:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('[fixtures] Unexpected error:', err);
    return [];
  }
}

/**
 * Fetch the next upcoming fixture (first in the list)
 */
export async function fetchNextFixture(): Promise<Fixture | null> {
  try {
    const { data, error } = await supabase
      .from(FCN_FIXTURES_VIEW)
      .select('*')
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error && shouldFallbackView(error)) {
      const fallback = await applyFcnFilter(supabase.from('fixtures').select('*'))
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        logger.error('[fixtures] Error fetching next fixture (fallback):', fallback.error);
        return null;
      }

      return fallback.data || null;
    }

    if (error) {
      logger.error('[fixtures] Error fetching next fixture:', error);
      return null;
    }

    return data;
  } catch (err) {
    logger.error('[fixtures] Unexpected error:', err);
    return null;
  }
}

/**
 * Format ISO date to Danish locale with weekday, date, and time
 * Example: "Lørdag 18. januar 2025, 14:00"
 */
export function formatDateDa(isoString: string): string {
  try {
    const date = new Date(isoString);
    const weekday = date.toLocaleDateString('da-DK', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('da-DK', { month: 'long' });
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

    // Capitalize first letter of weekday
    const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    return `${weekdayCapitalized} ${day}. ${month} ${year}, kl. ${time}`;
  } catch (err) {
    logger.error('[fixtures] Error formatting date:', err);
    return isoString;
  }
}

/**
 * Format just time from ISO string
 * Example: "14:00"
 */
export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
}

/**
 * Format short date (without weekday and time)
 * Example: "18. januar 2025"
 */
export function formatShortDateDa(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = date.getDate();
    const month = date.toLocaleDateString('da-DK', { month: 'long' });
    const year = date.getFullYear();

    return `${day}. ${month} ${year}`;
  } catch (err) {
    return isoString;
  }
}
