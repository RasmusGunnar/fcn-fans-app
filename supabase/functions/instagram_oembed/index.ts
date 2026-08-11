import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0';
import {
  createSlidingWindowRateLimiter,
  InstagramEmbedError,
  resolveInstagramEmbed,
  type InstagramEmbedCacheRow,
} from './core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_REQUEST_BYTES = 4096;
const allowRequest = createSlidingWindowRateLimiter(30, 60_000);

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: 'request_too_large' }, 413);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'missing_server_config' }, 500);
  }
  if (!/^Bearer\s+\S+$/i.test(authHeader) || authHeader.length > 8192) {
    return json({ error: 'unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  if (!allowRequest(userData.user.id)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  let body: unknown;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: 'request_too_large' }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const rawUrl =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).url
      : undefined;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const result = await resolveInstagramEmbed(rawUrl, {
      cache: {
        get: async (canonicalUrl) => {
          const { data, error } = await adminClient
            .from('instagram_embed_cache')
            .select('*')
            .eq('canonical_url', canonicalUrl)
            .maybeSingle();
          if (error) throw new Error('cache_read_failed');
          if (!data) return null;
          return {
            canonicalUrl: data.canonical_url,
            resourceType: data.resource_type,
            status: data.status,
            embedHtml: data.embed_html,
            authorName: data.author_name,
            authorUrl: data.author_url,
            thumbnailUrl: data.thumbnail_url,
            errorCode: data.error_code,
            fetchedAt: data.fetched_at,
            expiresAt: data.expires_at,
          } as InstagramEmbedCacheRow;
        },
        put: async (row) => {
          const { error } = await adminClient.from('instagram_embed_cache').upsert(
            {
              canonical_url: row.canonicalUrl,
              resource_type: row.resourceType,
              status: row.status,
              embed_html: row.embedHtml,
              author_name: row.authorName,
              author_url: row.authorUrl,
              thumbnail_url: row.thumbnailUrl,
              error_code: row.errorCode,
              fetched_at: row.fetchedAt,
              expires_at: row.expiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'canonical_url' },
          );
          if (error) throw new Error('cache_write_failed');
        },
      },
    });
    return json(result);
  } catch (error) {
    if (error instanceof InstagramEmbedError) return json({ error: error.code }, 400);
    console.error('[instagram_oembed] unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'instagram_embed_failed' }, 500);
  }
});
