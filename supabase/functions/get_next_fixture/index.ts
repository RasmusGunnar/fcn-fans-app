// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

serve(async (req) => {
  try {
    // Get Supabase credentials from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
      });
    }

    // Initialize Supabase client (no auth required - using anon key)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Query for next fixture: kickoff_at >= now, sorted ascending, return first match
    const { data: fixture, error } = await supabase
      .from('fixtures')
      .select('*')
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Database query error:', error);
      return new Response(JSON.stringify({ error: 'Database query failed', details: error }), {
        status: 500,
      });
    }

    // Return fixture or null if none found
    return new Response(JSON.stringify({ fixture }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(e) }), {
      status: 500,
    });
  }
});
