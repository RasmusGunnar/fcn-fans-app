import { supabase } from '../lib/supabase';

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
  created_at: string;
  organizer?: FanGroup | null;
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
  // Location/geocoding fields
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
  geocoded_at?: string | null;
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
    }
  | {
      kind: 'event';
      id: string;
      title: string;
      startAt: string;
      location: string | null;
      organizerName: string | null;
      description: string | null;
      lat?: number | null;
      lng?: number | null;
      created_by?: string | null;
      organizer_group_id?: string | null;
    };

// ===== API FUNCTIONS =====

/**
 * Fetch upcoming fixtures (matches) from Supabase
 */
export async function fetchMatchesUpcoming(limit = 20): Promise<Fixture[]> {
  try {
    const { data, error } = await supabase
      .from('fixtures')
      .select('*')
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[eventsApi] Error fetching matches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[eventsApi] Unexpected error fetching matches:', err);
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
        'id, title, start_at, departure_place, total_seats, seats_taken, price_dkk, fixture_id, organizer_group_id',
      )
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('[eventsApi] Error fetching bus trips', error);
      return [];
    }

    return (data || []) as unknown as BusTrip[];
  } catch (err) {
    console.error('[eventsApi] Unexpected error fetching bus trips:', err);
    return [];
  }
}

/**
 * Fetch upcoming events from Supabase (simplified - no joins)
 */
export async function fetchEventsUpcoming(limit = 20): Promise<Event[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, start_at, end_at, location_name, location_address, organizer_group_id, created_by, created_at, lat, lng')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('[eventsApi] Error fetching events', error);
      return [];
    }

    return (data || []) as unknown as Event[];
  } catch (err) {
    console.error('[eventsApi] Unexpected error fetching events:', err);
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

    // Map to FeedItem union type
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
      lat: m.lat,
      lng: m.lng,
    }));

    const busTripItems: FeedItem[] = busTrips.map((bt) => ({
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
    }));

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
      created_by: e.created_by,
      organizer_group_id: e.organizer_group_id,
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
    console.error('[eventsApi] Unexpected error in fetchFeedUpcoming:', err);
    return [];
  }
}

/**
 * Fetch single bus trip by ID (with organizer and fixture)
 */
export async function fetchBusTripById(id: string): Promise<BusTrip | null> {
  try {
    console.log('[eventsApi] Fetching bus trip by id:', id);
    const { data, error } = await supabase.from('bus_trips').select('*').eq('id', id).single();

    if (error) {
      console.warn('[eventsApi] Error fetching bus trip by id', error);
      return null;
    }

    console.log('[eventsApi] Bus trip fetched successfully:', data);
    return data as unknown as BusTrip;
  } catch (err) {
    console.warn('[eventsApi] Error fetching bus trip by id', err);
    return null;
  }
}

/**
 * Fetch single event by ID (with organizer)
 */
export async function fetchEventById(id: string): Promise<Event | null> {
  try {
    console.log('[eventsApi] Fetching event by id:', id);
    const { data, error } = await supabase
      .from('events')
      .select(
        'id, title, description, start_at, end_at, location_name, location_address, organizer_group_id, created_by, created_at',
      )
      .eq('id', id)
      .single();

    if (error) {
      console.warn('[eventsApi] Error fetching event by id', error);
      return null;
    }

    console.log('[eventsApi] Event fetched successfully:', data);
    return data as unknown as Event;
  } catch (err) {
    console.warn('[eventsApi] Error fetching event by id', err);
    return null;
  }
}

/**
 * Fetch single fixture by ID
 */
export async function fetchFixtureById(id: string): Promise<Fixture | null> {
  try {
    const { data, error } = await supabase.from('fixtures').select('*').eq('id', id).maybeSingle();

    if (error) {
      console.error('[eventsApi] Error fetching fixture:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[eventsApi] Unexpected error fetching fixture:', err);
    return null;
  }
}
