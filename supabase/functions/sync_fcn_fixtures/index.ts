// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// API-FOOTBALL base URL
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

serve(async (req) => {
  try {
    // Authenticate request with secret header
    const syncSecret = Deno.env.get('SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');
    if (!syncSecret || providedSecret !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Get required environment variables
    const apiFootballKey = Deno.env.get('API_FOOTBALL_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fcnTeamSearch = Deno.env.get('FCN_TEAM_SEARCH') || 'FC Nordsjaelland';

    if (!apiFootballKey || !supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { status: 500 }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Resolve FCN team ID via API-FOOTBALL
    console.log(`Searching for team: ${fcnTeamSearch}`);
    const teamSearchRes = await fetch(`${API_FOOTBALL_BASE}/teams?search=${encodeURIComponent(fcnTeamSearch)}`, {
      headers: {
        'x-apisports-key': apiFootballKey,
      },
    });

    if (!teamSearchRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to search teams', status: teamSearchRes.status }),
        { status: 500 }
      );
    }

    const teamSearchData = await teamSearchRes.json();
    const teams = teamSearchData?.response || [];
    if (teams.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Team not found', search: fcnTeamSearch }),
        { status: 404 }
      );
    }

    const fcnTeamId = teams[0].team.id;
    console.log(`Found team ID: ${fcnTeamId} (${teams[0].team.name})`);

    // Step 2: Fetch next 10 fixtures for FCN
    console.log(`Fetching next 10 fixtures for team ${fcnTeamId}...`);
    const fixturesRes = await fetch(`${API_FOOTBALL_BASE}/fixtures?team=${fcnTeamId}&next=10`, {
      headers: {
        'x-apisports-key': apiFootballKey,
      },
    });

    if (!fixturesRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch fixtures', status: fixturesRes.status }),
        { status: 500 }
      );
    }

    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData?.response || [];
    console.log(`Retrieved ${fixtures.length} fixtures`);

    // Step 3: Map API-FOOTBALL response to our fixtures table format
    const fixturesToUpsert = fixtures.map((f: any) => ({
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

    // Step 4: UPSERT fixtures to database (conflict on provider_fixture_id)
    const { data, error } = await supabase
      .from('fixtures')
      .upsert(fixturesToUpsert, {
        onConflict: 'provider_fixture_id',
      })
      .select();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Database upsert failed', details: error }),
        { status: 500 }
      );
    }

    console.log(`Successfully synced ${data?.length || 0} fixtures`);
    return new Response(
      JSON.stringify({
        success: true,
        team: teams[0].team.name,
        teamId: fcnTeamId,
        synced: data?.length || 0,
        fixtures: data,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(e) }),
      { status: 500 }
    );
  }
});
