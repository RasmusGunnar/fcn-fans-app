import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 256 * 1024;
const USER_AGENT = 'fcn-fans-discussion-preview/1.0';

type CachedPreview = {
  id: string;
  url: string;
  normalized_url: string;
  resolved_url: string | null;
  domain: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  status: 'ready' | 'failed';
  error_message: string | null;
};

type PreviewResponse = {
  id: string;
  url: string;
  resolvedUrl: string;
  domain: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  status: 'ready' | 'failed';
  error?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = '';
  }
  return parsed.toString();
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function isBlockedIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const clean = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return (
    clean === '::1' ||
    clean === '::' ||
    clean.startsWith('::ffff:127.') ||
    clean.startsWith('::ffff:10.') ||
    clean.startsWith('::ffff:192.168.') ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    clean.startsWith('fe80:')
  );
}

function isBlockedHostname(hostname: string): boolean {
  const clean = hostname.replace(/\.$/, '').toLowerCase();
  return (
    clean === 'localhost' ||
    clean === 'metadata.google.internal' ||
    clean.endsWith('.localhost') ||
    clean.endsWith('.local') ||
    clean.endsWith('.internal') ||
    clean.endsWith('.home.arpa') ||
    clean === '169.254.169.254' ||
    clean === '100.100.100.200' ||
    (isIpv4(clean) && isBlockedIpv4(clean)) ||
    (clean.includes(':') && isBlockedIpv6(clean))
  );
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('invalid_scheme');
  }

  if (url.username || url.password) {
    throw new Error('credentials_not_allowed');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('blocked_host');
  }

  if (!isIpv4(url.hostname) && !url.hostname.includes(':')) {
    const resolvedIpv4: string[] = [];
    const resolvedIpv6: string[] = [];

    try {
      resolvedIpv4.push(...(await Deno.resolveDns(url.hostname, 'A')));
    } catch {
      // Some valid public hosts have no A record.
    }

    try {
      resolvedIpv6.push(...(await Deno.resolveDns(url.hostname, 'AAAA')));
    } catch {
      // Some valid public hosts have no AAAA record.
    }

    if (resolvedIpv4.length === 0 && resolvedIpv6.length === 0) {
      throw new Error('dns_lookup_failed');
    }

    if (resolvedIpv4.some(isBlockedIpv4) || resolvedIpv6.some(isBlockedIpv6)) {
      throw new Error('blocked_resolved_ip');
    }
  }

  return url;
}

async function readLimitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}

function getMetaContent(html: string, matcher: RegExp): string | null {
  const match = html.match(matcher);
  if (!match?.[0]) return null;

  const tag = match[0];
  const contentMatch =
    tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
  return contentMatch?.[1]?.trim() || null;
}

function stripHtml(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .slice(0, 280);
}

function extractTitle(html: string): string | null {
  const ogTitle = getMetaContent(html, /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*>/i);
  const twitterTitle = getMetaContent(
    html,
    /<meta\b[^>]*(?:property|name)=["']twitter:title["'][^>]*>/i,
  );
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(ogTitle || twitterTitle || titleMatch?.[1] || null);
}

function extractDescription(html: string): string | null {
  const ogDescription = getMetaContent(
    html,
    /<meta\b[^>]*(?:property|name)=["']og:description["'][^>]*>/i,
  );
  const metaDescription = getMetaContent(
    html,
    /<meta\b[^>]*(?:property|name)=["']description["'][^>]*>/i,
  );
  const twitterDescription = getMetaContent(
    html,
    /<meta\b[^>]*(?:property|name)=["']twitter:description["'][^>]*>/i,
  );
  return stripHtml(ogDescription || metaDescription || twitterDescription);
}

function extractImageUrl(html: string, baseUrl: string): string | null {
  const image =
    getMetaContent(html, /<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*>/i) ||
    getMetaContent(html, /<meta\b[^>]*(?:property|name)=["']twitter:image["'][^>]*>/i);

  if (!image) return null;

  try {
    const resolved = new URL(image, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

async function fetchPreviewHtml(rawUrl: string): Promise<{ html: string; resolvedUrl: string }> {
  let currentUrl = (await assertSafeUrl(rawUrl)).toString();

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('redirect_without_location');
        const redirected = new URL(location, currentUrl).toString();
        currentUrl = (await assertSafeUrl(redirected)).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`http_${response.status}`);
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType && !contentType.includes('text/html')) {
        throw new Error('unsupported_content_type');
      }

      return {
        html: await readLimitedText(response),
        resolvedUrl: currentUrl,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('fetch_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('too_many_redirects');
}

function toPreviewResponse(row: CachedPreview): PreviewResponse {
  return {
    id: row.id,
    url: row.url,
    resolvedUrl: row.resolved_url || row.url,
    domain: row.domain || new URL(row.url).hostname.replace(/^www\./i, ''),
    title: row.title || undefined,
    description: row.description || undefined,
    imageUrl: row.image_url || undefined,
    status: row.status,
    error: row.error_message || undefined,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'missing_server_config' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: 'unauthorized' }, 401);
  }

  let normalizedUrl = '';
  try {
    const body = await req.json();
    if (typeof body?.url !== 'string' || body.url.trim().length === 0) {
      return json({ error: 'missing_url' }, 400);
    }
    normalizedUrl = normalizeUrl(body.url);
    await assertSafeUrl(normalizedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_url';
    return json({ error: message }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: cached, error: cachedError } = await adminClient
    .from('discussion_link_previews')
    .select('*')
    .eq('normalized_url', normalizedUrl)
    .maybeSingle();

  if (cachedError) {
    console.error('[discussion-link-preview] cache lookup failed', {
      code: cachedError.code,
      message: cachedError.message,
    });
  }

  if (cached) {
    return json(toPreviewResponse(cached as CachedPreview));
  }

  let resolvedUrl = normalizedUrl;
  let domain = new URL(normalizedUrl).hostname.replace(/^www\./i, '');
  let rowPayload: Record<string, unknown>;

  try {
    const fetched = await fetchPreviewHtml(normalizedUrl);
    resolvedUrl = fetched.resolvedUrl;
    domain = new URL(resolvedUrl).hostname.replace(/^www\./i, '');

    rowPayload = {
      url: normalizedUrl,
      normalized_url: normalizedUrl,
      resolved_url: resolvedUrl,
      domain,
      title: extractTitle(fetched.html),
      description: extractDescription(fetched.html),
      image_url: extractImageUrl(fetched.html, resolvedUrl),
      status: 'ready',
      error_message: null,
      fetched_at: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch_failed';
    rowPayload = {
      url: normalizedUrl,
      normalized_url: normalizedUrl,
      resolved_url: resolvedUrl,
      domain,
      title: null,
      description: null,
      image_url: null,
      status: 'failed',
      error_message: message,
      fetched_at: new Date().toISOString(),
    };
  }

  const { data: saved, error: saveError } = await adminClient
    .from('discussion_link_previews')
    .upsert(rowPayload, { onConflict: 'normalized_url' })
    .select('*')
    .single();

  if (saveError || !saved) {
    console.error('[discussion-link-preview] cache save failed', {
      code: saveError?.code,
      message: saveError?.message,
    });
    return json({ error: 'cache_save_failed' }, 500);
  }

  return json(toPreviewResponse(saved as CachedPreview));
});
