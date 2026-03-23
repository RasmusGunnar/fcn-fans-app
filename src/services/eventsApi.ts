import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { getMatchHeroUrl, getTeamHeroImage } from './sportsdb';

// ===== TYPES =====

export interface FanGroup {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
}

export interface BusTrip {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  expected_return_at: string | null;
  departure_place: string;
  departure_address: string | null;
  price_dkk: number | null;
  total_seats: number;
  seats_taken: number;
  includes: string[] | null;
  organizer_group_id: string | null;
  fixture_id: string | null;
  created_at: string;
  updated_at: string;
  organizer?: FanGroup | null;
  fixture?: {
    id: string;
    home_team: string;
    away_team: string;
    kickoff_at: string;
    venue: string | null;
  } | null;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location_name: string | null;
  location_address: string | null;
  organizer_group_id: string | null;
  created_by: string | null;
  creator_user_id?: string | null;
  organizer_type?: 'fan' | 'community' | null;
  organizer_id?: string | null;
  created_at: string;
  organizer?: FanGroup | null;
  capacity?: number | null;
  // Cover image
  cover_bucket?: string | null;
  cover_path?: string | null;
  // Location/geocoding fields
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  address_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
  geocoded_at?: string | null;
}

export interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  kickoff_at: string;
  venue: string | null;
  venue_city: string | null;
  competition: string | null;
  round: string | null;
  home_team_provider_id?: string | null;
  away_team_provider_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
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
  return (
    error?.code === '42P01' || message.includes('does not exist') || message.includes('relation')
  );
}

function applyFcnFilter(query: any) {
  return query.or(`home_team.ilike.${FCN_TEAM_FILTER},away_team.ilike.${FCN_TEAM_FILTER}`);
}

async function runFixtureQuery(params: { table: string; upcoming: boolean; limit: number }) {
  const now = new Date().toISOString();
  let query = supabase.from(params.table).select('*');
  if (params.table === 'fixtures') {
    query = applyFcnFilter(query);
  }
  query = params.upcoming
    ? query.gte('kickoff_at', now).order('kickoff_at', { ascending: true })
    : query.lt('kickoff_at', now).order('kickoff_at', { ascending: false });

  return query.limit(params.limit);
}

// Feed item discriminated union
export type FeedItem =
  | {
      kind: 'match';
      id: string;
      kickoffAt: string;
      home: string;
      away: string;
      homeLogo: string | null;
      awayLogo: string | null;
      venue: string | null;
      venueCity: string | null;
      round: string | null;
      competition: string | null;
      homeTeamProviderId?: string | null;
      heroUrl?: string | null;
      lat?: number | null;
      lng?: number | null;
    }
  | {
      kind: 'bus_trip';
      id: string;
      title: string;
      startAt: string;
      departurePlace: string;
      seatsLeft: number;
      totalSeats: number;
      priceDkk: number | null;
      fixtureId: string | null;
      organizerName: string | null;
      description: string | null;
      lat?: number | null;
      lng?: number | null;
      venue?: string | null;
    }
  | {
      kind: 'event';
      id: string;
      title: string;
      startAt: string;
      location: string | null;
      organizerName: string | null;
      description: string | null;
      organizer_type?: 'fan' | 'community' | null;
      organizer_id?: string | null;
      creator_user_id?: string | null;
      lat?: number | null;
      lng?: number | null;
      created_by?: string | null;
      organizer_group_id?: string | null;
      cover_bucket?: string | null;
      cover_path?: string | null;
    };

// ===== API FUNCTIONS =====

/**
 * Fetch upcoming fixtures (matches) from Supabase
 */
export async function fetchMatchesUpcoming(limit = 20): Promise<Fixture[]> {
  try {
    const { data, error } = await runFixtureQuery({
      table: FCN_FIXTURES_VIEW,
      upcoming: true,
      limit,
    });

    if (error && shouldFallbackView(error)) {
      const fallback = await runFixtureQuery({
        table: 'fixtures',
        upcoming: true,
        limit,
      });
      if (fallback.error) {
        logger.error('[eventsApi] Error fetching matches (fallback):', fallback.error);
        return [];
      }
      return fallback.data || [];
    }

    if (error) {
      logger.error('[eventsApi] Error fetching matches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('[eventsApi] Unexpected error fetching matches:', err);
    return [];
  }
}

/**
 * Fetch recent fixtures (matches) from Supabase
 */
export async function fetchMatchesRecent(limit = 10): Promise<Fixture[]> {
  try {
    const { data, error } = await runFixtureQuery({
      table: FCN_FIXTURES_VIEW,
      upcoming: false,
      limit,
    });

    if (error && shouldFallbackView(error)) {
      const fallback = await runFixtureQuery({
        table: 'fixtures',
        upcoming: false,
        limit,
      });
      if (fallback.error) {
        logger.error('[eventsApi] Error fetching recent matches (fallback):', fallback.error);
        return [];
      }
      return fallback.data || [];
    }

    if (error) {
      logger.error('[eventsApi] Error fetching recent matches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('[eventsApi] Unexpected error fetching recent matches:', err);
    return [];
  }
}

/**
 * Fetch upcoming bus trips from Supabase (simplified - no joins)
 */
export async function fetchBusTripsUpcoming(limit = 20): Promise<BusTrip[]> {
  try {
    const { data, error } = await supabase
      .from('bus_trips')
      .select(
        'id, title, description, start_at, expected_return_at, departure_place, departure_address, total_seats, seats_taken, price_dkk, fixture_id, organizer_group_id, created_at, fixtures:fixtures(lat,lng,venue,venue_city,place_name)',
      )
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.warn('[eventsApi] Error fetching bus trips', error);
      return [];
    }

    return (data || []) as unknown as BusTrip[];
  } catch (err) {
    logger.error('[eventsApi] Unexpected error fetching bus trips:', err);
    return [];
  }
}

/**
 * Fetch upcoming events from Supabase.
 * Uses select('*') to avoid 42703 errors from missing columns.
 * Includes a 2-hour lookback so events that just started still appear.
 */
export async function fetchEventsUpcoming(limit = 20, communityId?: string): Promise<Event[]> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // now − 2 h

  try {
    let query = supabase
      .from('events')
      .select('*')
      .gte('start_at', cutoff)
      .order('start_at', { ascending: true })
      .limit(limit);

    if (communityId) {
      query = query.eq('organizer_group_id', communityId);
    }

    const { data, error } = await query;

    if (error) {
      logger.warn('[eventsApi] fetchEventsUpcoming error:', error.code, error.message);
      return [];
    }

    return (data || []) as unknown as Event[];
  } catch (err) {
    logger.error('[eventsApi] Unexpected error fetching events:', err);
    return [];
  }
}

/**
 * Fetch and merge all upcoming feed items (matches, bus trips, events)
 * Returns a unified array sorted by start time
 */
export async function fetchFeedUpcoming(): Promise<FeedItem[]> {
  try {
    // Fetch all three types in parallel (using allSettled for resilience)
    const results = await Promise.allSettled([
      fetchMatchesUpcoming(20),
      fetchBusTripsUpcoming(20),
      fetchEventsUpcoming(20),
    ]);

    // Extract fulfilled results, use empty array for rejected
    const matches = results[0].status === 'fulfilled' ? results[0].value : [];
    const busTrips = results[1].status === 'fulfilled' ? results[1].value : [];
    const events = results[2].status === 'fulfilled' ? results[2].value : [];

    logger.log(
      `[eventsApi] fetchFeedUpcoming — matches: ${matches.length}, busTrips: ${busTrips.length}, events: ${events.length}`,
    );

    // Map to FeedItem union type
    // Build match items and resolve hero images from team API when raw is empty
    const matchItems: FeedItem[] = matches.map((m) => ({
      kind: 'match' as const,
      id: m.id,
      kickoffAt: m.kickoff_at,
      home: m.home_team,
      away: m.away_team,
      homeLogo: m.home_logo_url,
      awayLogo: m.away_logo_url,
      venue: m.venue,
      venueCity: m.venue_city,
      round: m.round,
      competition: m.competition,
      homeTeamProviderId: m.home_team_provider_id ?? null,
      heroUrl: getMatchHeroUrl(m),
      lat: m.lat,
      lng: m.lng,
    }));

    // Enrich: for matches without a heroUrl, try the team API (cached per session)
    await Promise.all(
      matchItems.map(async (item) => {
        if (item.kind !== 'match') return;
        if (item.heroUrl) return;
        const pid = item.homeTeamProviderId;
        if (!pid) return;
        const teamHero = await getTeamHeroImage(pid);
        if (teamHero) (item as any).heroUrl = teamHero;
      }),
    );

    const busTripItems: FeedItem[] = busTrips.map((bt) => {
      const fix = (bt as any).fixtures as {
        lat?: number | null;
        lng?: number | null;
        venue?: string | null;
        venue_city?: string | null;
        place_name?: string | null;
      } | null;
      return {
        kind: 'bus_trip' as const,
        id: bt.id,
        title: bt.title,
        startAt: bt.start_at,
        departurePlace: bt.departure_place,
        seatsLeft: (bt.total_seats ?? 0) - (bt.seats_taken ?? 0),
        totalSeats: bt.total_seats,
        priceDkk: bt.price_dkk,
        fixtureId: bt.fixture_id,
        organizerName: null,
        description: bt.description,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        venue: fix?.venue ?? null,
      };
    });

    const eventItems: FeedItem[] = events.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      title: e.title,
      startAt: e.start_at,
      location: e.location_name,
      lat: e.lat,
      lng: e.lng,
      organizerName: null,
      description: e.description,
      organizer_type: e.organizer_type ?? null,
      organizer_id: e.organizer_id ?? null,
      creator_user_id: e.creator_user_id ?? null,
      created_by: e.created_by,
      organizer_group_id: e.organizer_group_id,
      cover_bucket: e.cover_bucket ?? null,
      cover_path: e.cover_path ?? null,
    }));

    // Merge and sort by start time ascending
    const allItems = [...matchItems, ...busTripItems, ...eventItems];
    allItems.sort((a, b) => {
      const timeA = a.kind === 'match' ? a.kickoffAt : a.startAt;
      const timeB = b.kind === 'match' ? b.kickoffAt : b.startAt;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    return allItems;
  } catch (err) {
    logger.error('[eventsApi] Unexpected error in fetchFeedUpcoming:', err);
    return [];
  }
}

/**
 * Fetch single bus trip by ID (with organizer and fixture)
 */
export async function fetchBusTripById(id: string): Promise<BusTrip | null> {
  try {
    logger.log('[eventsApi] Fetching bus trip by id:', id);
    const { data, error } = await supabase.from('bus_trips').select('*').eq('id', id).single();

    if (error) {
      logger.warn('[eventsApi] Error fetching bus trip by id', error);
      return null;
    }

    logger.log('[eventsApi] Bus trip fetched successfully:', data);
    return data as unknown as BusTrip;
  } catch (err) {
    logger.warn('[eventsApi] Error fetching bus trip by id', err);
    return null;
  }
}

async function fetchEventOrganizer(event: Event): Promise<FanGroup | null> {
  const organizerId = event.organizer_group_id ?? event.organizer_id ?? null;
  if (!organizerId) return null;

  // Current app flow creates community-backed events, but older data may still point at fan_groups.
  if (event.organizer_type === 'community') {
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id, name, description, avatar_url')
      .eq('id', organizerId)
      .maybeSingle();

    if (!communityError && community) {
      return {
        id: community.id,
        name: community.name,
        description: community.description ?? null,
        logo_url: community.avatar_url ?? null,
        created_at: '',
      };
    }
  }

  const { data: fanGroup, error: fanGroupError } = await supabase
    .from('fan_groups')
    .select('id, name, description, logo_url, created_at')
    .eq('id', organizerId)
    .maybeSingle();

  if (fanGroupError) {
    logger.warn('[eventsApi] Error fetching event organizer:', fanGroupError);
    return null;
  }

  return (fanGroup as FanGroup | null) ?? null;
}

/**
 * Fetch single event by ID (with organizer)
 */
export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    logger.log('[eventsApi] Fetching event by id:', id);
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();

    if (error) {
      logger.warn('[eventsApi] fetchEventById error:', error.code, error.message);
      return null;
    }

    const event = data as unknown as Event;
    event.organizer = await fetchEventOrganizer(event);
    return event;
  } catch (err) {
    logger.warn('[eventsApi] Error fetching event by id', err);
    return null;
  }
}

/**
 * Fetch single fixture by ID
 */
export async function fetchFixtureById(id: string): Promise<Fixture | null> {
  try {
    const { data, error } = await supabase
      .from(FCN_FIXTURES_VIEW)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error && shouldFallbackView(error)) {
      const fallback = await supabase.from('fixtures').select('*').eq('id', id).maybeSingle();
      if (fallback.error) {
        logger.error('[eventsApi] Error fetching fixture (fallback):', fallback.error);
        return null;
      }
      return fallback.data || null;
    }

    if (error) {
      logger.error('[eventsApi] Error fetching fixture:', error);
      return null;
    }

    return data;
  } catch (err) {
    logger.error('[eventsApi] Unexpected error fetching fixture:', err);
    return null;
  }
}
