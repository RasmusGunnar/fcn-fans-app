// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ===== TYPES =====

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

// ===== PROVIDER ADAPTERS =====

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

/**
 * Fetch fixtures from API-FOOTBALL provider
 */
async function fetchFixturesFromApiFootball(
  apiKey: string,
  teamSearch: string,
): Promise<
  | { fixtures: NormalizedFixture[]; teamName?: string; teamId?: string }
  | { error: string; details?: any }
> {
  try {
    // Step 1: Resolve team ID
    console.log(`[api-football] Searching for team: ${teamSearch}`);
    const teamSearchRes = await fetch(
      `${API_FOOTBALL_BASE}/teams?search=${encodeURIComponent(teamSearch)}`,
      {
        headers: {
          'x-apisports-key': apiKey,
        },
      },
    );

    if (!teamSearchRes.ok) {
      return {
        error: 'Failed to search teams',
        details: { status: teamSearchRes.status },
      };
    }

    const raw = await teamSearchRes.text();
    console.log('[api-football] Raw response:', raw.slice(0, 2000));
    const teamSearchData = JSON.parse(raw);

    // Check for API errors (e.g., access suspended, rate limit)
    if (teamSearchData.errors && Object.keys(teamSearchData.errors).length > 0) {
      console.error('[api-football] API returned errors:', teamSearchData.errors);
      return {
        error: 'API-Football provider error',
        details: teamSearchData.errors,
      };
    }

    const teams = teamSearchData?.response || [];

    if (teams.length === 0) {
      console.log('[api-football] Team not found:', {
        search: teamSearch,
        status: teamSearchRes.status,
        rateLimitRemaining: teamSearchRes.headers.get('x-ratelimit-remaining'),
        response: raw.slice(0, 2000),
      });
      return {
        error: 'Team not found',
        details: { search: teamSearch },
      };
    }

    const fcnTeamId = teams[0].team.id;
    const fcnTeamName = teams[0].team.name;
    console.log(`[api-football] Found team ID: ${fcnTeamId} (${fcnTeamName})`);

    // Step 2: Fetch next 10 fixtures
    console.log(`[api-football] Fetching next 10 fixtures for team ${fcnTeamId}...`);
    const fixturesRes = await fetch(`${API_FOOTBALL_BASE}/fixtures?team=${fcnTeamId}&next=10`, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!fixturesRes.ok) {
      return {
        error: 'Failed to fetch fixtures',
        details: { status: fixturesRes.status },
      };
    }

    const fixturesData = await fixturesRes.json();

    // Check for API errors
    if (fixturesData.errors && Object.keys(fixturesData.errors).length > 0) {
      console.error('[api-football] API returned errors:', fixturesData.errors);
      return {
        error: 'API-Football provider error',
        details: fixturesData.errors,
      };
    }

    const fixtures = fixturesData?.response || [];
    console.log(`[api-football] Retrieved ${fixtures.length} fixtures`);

    // Step 3: Map to normalized format
    const normalized: NormalizedFixture[] = fixtures.map((f: any) => ({
      provider: 'api-football',
      provider_fixture_id: String(f.fixture.id),
      kickoff_at: f.fixture.date,
      competition: f.league?.name || null,
      round: f.league?.round || null,
      venue: f.fixture?.venue?.name || null,
      venue_city: f.fixture?.venue?.city || null,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_logo_url: f.teams.home.logo || null,
      away_logo_url: f.teams.away.logo || null,
      updated_at: new Date().toISOString(),
    }));

    return {
      fixtures: normalized,
      teamName: fcnTeamName,
      teamId: String(fcnTeamId),
    };
  } catch (err) {
    console.error('[api-football] Unexpected error:', err);
    return {
      error: 'Unexpected provider error',
      details: String(err),
    };
  }
}

/**
 * Fetch fixtures from RapidAPI provider (stub - TODO)
 */
async function fetchFixturesFromRapidApi(
  apiKey: string,
  teamSearch: string,
): Promise<
  | { fixtures: NormalizedFixture[]; teamName?: string; teamId?: string }
  | { error: string; details?: any }
> {
  console.warn('[rapidapi] Provider not yet implemented');
  return {
    error: 'RapidAPI provider not implemented',
    details: 'TODO: implement RapidAPI adapter',
  };
}

// ===== GEOCODING =====

/**
 * Geocode an address using OpenStreetMap Nominatim
 * With simple rate limiting (1 second delay)
 */
async function geocodeAddress(addressText: string): Promise<GeocodingResult | null> {
  if (!addressText || !addressText.trim()) {
    return null;
  }

  try {
    // Rate limit: wait 1 second between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&limit=1`;
    console.log(`[geocoding] Requesting: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FCN-Fans-Sync/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[geocoding] HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`[geocoding] No results for: ${addressText}`);
      return null;
    }

    const first = data[0];
    const result: GeocodingResult = {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      place_name: first.display_name || addressText,
    };

    console.log(`[geocoding] Success: ${result.place_name}`);
    return result;
  } catch (err) {
    console.error('[geocoding] Error geocoding address:', err);
    return null;
  }
}

/**
 * Geocode fixtures that don't have lat/lng yet
 */
async function geocodeFixtures(supabase: any): Promise<GeocodingSummary> {
  console.log('[geocoding] Checking for fixtures needing geocoding...');
  const { data: fixturesNeedingGeocode, error: geocodeQueryError } = await supabase
    .from('fixtures')
    .select('id, venue, venue_city, lat, lng')
    .or('lat.is.null,lng.is.null')
    .limit(10); // Geocode max 10 per sync to respect rate limits

  if (geocodeQueryError) {
    console.warn('[geocoding] Failed to query fixtures:', geocodeQueryError);
    return { scanned: 0, geocoded: 0, skipped: 0, failed: 0 };
  }

  if (!fixturesNeedingGeocode || fixturesNeedingGeocode.length === 0) {
    console.log('[geocoding] No fixtures need geocoding');
    return { scanned: 0, geocoded: 0, skipped: 0, failed: 0 };
  }

  console.log(`[geocoding] Found ${fixturesNeedingGeocode.length} fixtures to process`);

  let geocoded = 0;
  let skipped = 0;
  let failed = 0;

  for (const fixture of fixturesNeedingGeocode) {
    // Skip if venue is missing
    if (!fixture.venue) {
      console.log(`[geocoding] Skipping fixture ${fixture.id}: no venue`);
      skipped++;
      continue;
    }

    // Build address text from venue and venue_city
    const addressParts: string[] = [];
    if (fixture.venue) addressParts.push(fixture.venue);
    if (fixture.venue_city) addressParts.push(fixture.venue_city);
    addressParts.push('Danmark'); // Assume Denmark

    const addressText = addressParts.join(', ');
    console.log(`[geocoding] Geocoding fixture ${fixture.id}: ${addressText}`);

    const geoResult = await geocodeAddress(addressText);
    if (geoResult) {
      // Update fixture with geocoding result
      const { error: updateError } = await supabase
        .from('fixtures')
        .update({
          lat: geoResult.lat,
          lng: geoResult.lng,
          place_name: geoResult.place_name,
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', fixture.id);

      if (updateError) {
        console.warn(`[geocoding] Failed to update fixture ${fixture.id}:`, updateError);
        failed++;
      } else {
        console.log(`[geocoding] ✓ Geocoded fixture ${fixture.id}`);
        geocoded++;
      }
    } else {
      console.warn(`[geocoding] Failed to geocode fixture ${fixture.id}`);
      failed++;
    }
  }

  const summary: GeocodingSummary = {
    scanned: fixturesNeedingGeocode.length,
    geocoded,
    skipped,
    failed,
  };

  console.log(
    `[geocoding] Summary: scanned=${summary.scanned}, geocoded=${summary.geocoded}, skipped=${summary.skipped}, failed=${summary.failed}`,
  );

  return summary;
}

// ===== MAIN HANDLER =====

serve(async (req) => {
  try {
    // Authenticate request with secret header
    const syncSecret = Deno.env.get('SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');
    if (!syncSecret || providedSecret !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Get required environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fcnTeamSearch = Deno.env.get('FCN_TEAM_SEARCH') || 'FC Nordsjaelland';
    const fixtureProvider = (Deno.env.get('FIXTURE_PROVIDER') || 'api-football') as
      | 'api-football'
      | 'rapidapi';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing required environment variables' }), {
        status: 500,
      });
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to fetch fixtures from selected provider
    let providerResult:
      | { fixtures: NormalizedFixture[]; teamName?: string; teamId?: string }
      | { error: string; details?: any }
      | null = null;

    if (fixtureProvider === 'api-football') {
      const apiFootballKey = Deno.env.get('API_FOOTBALL_KEY');
      if (!apiFootballKey) {
        console.error('[provider] API_FOOTBALL_KEY not configured');
      } else {
        providerResult = await fetchFixturesFromApiFootball(apiFootballKey, fcnTeamSearch);
      }
    } else if (fixtureProvider === 'rapidapi') {
      const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
      if (!rapidApiKey) {
        console.error('[provider] RAPIDAPI_KEY not configured');
      } else {
        providerResult = await fetchFixturesFromRapidApi(rapidApiKey, fcnTeamSearch);
      }
    }

    // Check if provider fetch succeeded
    if (providerResult && 'fixtures' in providerResult) {
      // Provider success - upsert fixtures
      console.log(`[provider] Successfully fetched ${providerResult.fixtures.length} fixtures`);

      const { data, error } = await supabase
        .from('fixtures')
        .upsert(providerResult.fixtures, {
          onConflict: 'provider_fixture_id',
        })
        .select();

      if (error) {
        console.error('[db] Database error:', error);
        return new Response(JSON.stringify({ error: 'Database upsert failed', details: error }), {
          status: 500,
        });
      }

      console.log(`[db] Successfully synced ${data?.length || 0} fixtures`);

      // Geocode existing fixtures
      const geocodingSummary = await geocodeFixtures(supabase);

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'full-sync',
          provider: fixtureProvider,
          team: providerResult.teamName,
          teamId: providerResult.teamId,
          synced: data?.length || 0,
          geocoding: geocodingSummary,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } else {
      // Provider failed - fallback to geocode-only mode
      const providerError = providerResult?.error || 'Provider not configured';
      const providerDetails = providerResult?.details;

      console.warn(
        `[provider] Failed to fetch fixtures: ${providerError}. Falling back to geocode-only mode.`,
      );
      console.warn('[provider] Error details:', providerDetails);

      // Continue with geocoding existing fixtures
      const geocodingSummary = await geocodeFixtures(supabase);

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'geocode-only',
          reason: providerError,
          providerDetails,
          geocoding: geocodingSummary,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  } catch (e) {
    console.error('[main] Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(e) }), {
      status: 500,
    });
  }
});
