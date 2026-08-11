export const META_INSTAGRAM_OEMBED_ENDPOINT = 'https://graph.facebook.com/v25.0/instagram_oembed';
export const INSTAGRAM_EMBED_SCRIPT_URL = 'https://www.instagram.com/embed.js';
export const INSTAGRAM_EMBED_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
export const INSTAGRAM_EMBED_FAILURE_TTL_MS = 10 * 60 * 1000;
export const INSTAGRAM_EMBED_FETCH_TIMEOUT_MS = 5000;
export const INSTAGRAM_EMBED_MAX_RESPONSE_BYTES = 256 * 1024;
export const INSTAGRAM_EMBED_MAX_HTML_BYTES = 200 * 1024;
export const INSTAGRAM_URL_MAX_LENGTH = 2048;

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const RESERVED_PROFILE_PATHS = new Set([
  'about',
  'accounts',
  'api',
  'developer',
  'direct',
  'directory',
  'emails',
  'explore',
  'legal',
  'oauth',
  'p',
  'press',
  'privacy',
  'reel',
  'reels',
  'stories',
  'terms',
  'tv',
  'web',
]);
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{2,128}$/;
const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._]{0,29}$/;
const ALLOWED_THUMBNAIL_HOST_SUFFIXES = ['cdninstagram.com', 'fbcdn.net'];

export type InstagramEmbedResourceType = 'post' | 'reel' | 'profile';
export type InstagramEmbedUnavailableReason = 'private_or_unavailable' | 'temporarily_unavailable';

export type ParsedInstagramEmbedUrl = {
  canonicalUrl: string;
  resourceType: InstagramEmbedResourceType;
  externalId: string;
};

export type InstagramEmbedCacheRow = {
  canonicalUrl: string;
  resourceType: InstagramEmbedResourceType;
  status: 'ready' | 'unavailable';
  embedHtml: string | null;
  authorName: string | null;
  authorUrl: string | null;
  thumbnailUrl: string | null;
  errorCode: string | null;
  fetchedAt: string;
  expiresAt: string;
};

export type InstagramEmbedResponse =
  | {
      status: 'ready';
      canonicalUrl: string;
      resourceType: InstagramEmbedResourceType;
      html: string;
      authorName?: string;
      authorUrl?: string;
      thumbnailUrl?: string;
      fetchedAt: string;
      expiresAt: string;
      cached: boolean;
    }
  | {
      status: 'unavailable';
      canonicalUrl: string;
      resourceType: InstagramEmbedResourceType;
      reason: InstagramEmbedUnavailableReason;
      retryAfter: string;
      cached: boolean;
    };

export type InstagramEmbedCache = {
  get: (canonicalUrl: string) => Promise<InstagramEmbedCacheRow | null>;
  put: (row: InstagramEmbedCacheRow) => Promise<void>;
};

export class InstagramEmbedError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'InstagramEmbedError';
  }
}

export function parseOfficialInstagramUrl(rawUrl: unknown): ParsedInstagramEmbedUrl {
  if (typeof rawUrl !== 'string') throw new InstagramEmbedError('invalid_url');
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > INSTAGRAM_URL_MAX_LENGTH) {
    throw new InstagramEmbedError('invalid_url');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InstagramEmbedError('invalid_url');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    parsed.protocol !== 'https:' ||
    !INSTAGRAM_HOSTS.has(hostname) ||
    parsed.port ||
    parsed.username ||
    parsed.password
  ) {
    throw new InstagramEmbedError('invalid_url');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 2 && (segments[0] === 'p' || segments[0] === 'reel')) {
    const externalId = segments[1];
    if (!SHORTCODE_PATTERN.test(externalId)) {
      throw new InstagramEmbedError('unsupported_instagram_url');
    }
    const resourceType = segments[0] === 'reel' ? 'reel' : 'post';
    return {
      canonicalUrl: `https://www.instagram.com/${segments[0]}/${externalId}/`,
      resourceType,
      externalId,
    };
  }

  if (segments.length === 1) {
    const externalId = segments[0];
    if (!PROFILE_PATTERN.test(externalId) || RESERVED_PROFILE_PATHS.has(externalId.toLowerCase())) {
      throw new InstagramEmbedError('unsupported_instagram_url');
    }
    return {
      canonicalUrl: `https://www.instagram.com/${externalId}/`,
      resourceType: 'profile',
      externalId,
    };
  }

  throw new InstagramEmbedError('unsupported_instagram_url');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function sanitizeMetaEmbedHtml(rawHtml: unknown): string {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    throw new InstagramEmbedError('meta_malformed_response');
  }
  if (byteLength(rawHtml) > INSTAGRAM_EMBED_MAX_HTML_BYTES) {
    throw new InstagramEmbedError('meta_html_too_large');
  }

  const withoutScripts = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();

  if (
    !/<blockquote\b[^>]*class\s*=\s*["'][^"']*\binstagram-media\b[^"']*["'][^>]*>/i.test(
      withoutScripts,
    ) ||
    /<(?:script|iframe|object|embed|link|meta|base|form)\b/i.test(withoutScripts) ||
    /(?:javascript|file|data\s*:\s*text\/html)\s*:/i.test(withoutScripts)
  ) {
    throw new InstagramEmbedError('meta_unsafe_html');
  }

  return withoutScripts;
}

function optionalTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function safeAuthorUrl(value: unknown): string | undefined {
  try {
    const parsed = parseOfficialInstagramUrl(value);
    return parsed.resourceType === 'profile' ? parsed.canonicalUrl : undefined;
  } catch {
    return undefined;
  }
}

function safeThumbnailUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > INSTAGRAM_URL_MAX_LENGTH) return undefined;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (
      parsed.protocol !== 'https:' ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      !(
        INSTAGRAM_HOSTS.has(hostname) ||
        ALLOWED_THUMBNAIL_HOST_SUFFIXES.some(
          (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
        )
      )
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

type OfficialMetaEmbed = {
  html: string;
  authorName?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
};

export function parseOfficialMetaResponse(payload: unknown): OfficialMetaEmbed {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InstagramEmbedError('meta_malformed_response');
  }
  const value = payload as Record<string, unknown>;
  if (
    value.provider_name !== undefined &&
    String(value.provider_name).toLowerCase() !== 'instagram'
  ) {
    throw new InstagramEmbedError('meta_unexpected_provider');
  }

  return {
    html: sanitizeMetaEmbedHtml(value.html),
    authorName: optionalTrimmedString(value.author_name, 100),
    authorUrl: safeAuthorUrl(value.author_url),
    thumbnailUrl: safeThumbnailUrl(value.thumbnail_url),
  };
}

async function readLimitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > INSTAGRAM_EMBED_MAX_RESPONSE_BYTES) {
    throw new InstagramEmbedError('meta_response_too_large');
  }

  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > INSTAGRAM_EMBED_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new InstagramEmbedError('meta_response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export async function fetchOfficialInstagramEmbed(
  parsed: ParsedInstagramEmbedUrl,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = INSTAGRAM_EMBED_FETCH_TIMEOUT_MS,
): Promise<OfficialMetaEmbed> {
  const endpoint = new URL(META_INSTAGRAM_OEMBED_ENDPOINT);
  endpoint.searchParams.set('url', parsed.canonicalUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'fcn-fans-instagram-oembed/1.0',
      },
    });

    if (
      (response.status >= 300 && response.status < 400) ||
      response.redirected ||
      (response.url && new URL(response.url).origin !== endpoint.origin)
    ) {
      throw new InstagramEmbedError('meta_redirect_rejected');
    }
    if (!response.ok) {
      throw new InstagramEmbedError(`meta_http_${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      throw new InstagramEmbedError('meta_unsupported_content_type');
    }

    const text = await readLimitedResponseText(response);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new InstagramEmbedError('meta_malformed_response');
    }
    return parseOfficialMetaResponse(payload);
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new InstagramEmbedError('meta_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function unavailableReason(errorCode: string | null): InstagramEmbedUnavailableReason {
  return errorCode === 'meta_http_400' ||
    errorCode === 'meta_http_403' ||
    errorCode === 'meta_http_404'
    ? 'private_or_unavailable'
    : 'temporarily_unavailable';
}

function responseFromCacheRow(
  row: InstagramEmbedCacheRow,
  cached: boolean,
): InstagramEmbedResponse {
  if (row.status === 'ready' && row.embedHtml) {
    return {
      status: 'ready',
      canonicalUrl: row.canonicalUrl,
      resourceType: row.resourceType,
      html: sanitizeMetaEmbedHtml(row.embedHtml),
      authorName: row.authorName ?? undefined,
      authorUrl: row.authorUrl ?? undefined,
      thumbnailUrl: row.thumbnailUrl ?? undefined,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      cached,
    };
  }
  return {
    status: 'unavailable',
    canonicalUrl: row.canonicalUrl,
    resourceType: row.resourceType,
    reason: unavailableReason(row.errorCode),
    retryAfter: row.expiresAt,
    cached,
  };
}

export async function resolveInstagramEmbed(
  rawUrl: unknown,
  dependencies: { cache: InstagramEmbedCache; fetchImpl?: typeof fetch },
  nowMs = Date.now(),
): Promise<InstagramEmbedResponse> {
  const parsed = parseOfficialInstagramUrl(rawUrl);
  let cached: InstagramEmbedCacheRow | null = null;
  try {
    cached = await dependencies.cache.get(parsed.canonicalUrl);
  } catch {
    // A cache outage must not turn the fixed official lookup into a generic failure path.
  }
  if (
    cached &&
    cached.canonicalUrl === parsed.canonicalUrl &&
    cached.resourceType === parsed.resourceType &&
    Date.parse(cached.expiresAt) > nowMs
  ) {
    try {
      return responseFromCacheRow(cached, true);
    } catch {
      cached = null;
    }
  }

  const fetchedAt = new Date(nowMs).toISOString();
  let row: InstagramEmbedCacheRow;
  try {
    const official = await fetchOfficialInstagramEmbed(parsed, dependencies.fetchImpl);
    row = {
      canonicalUrl: parsed.canonicalUrl,
      resourceType: parsed.resourceType,
      status: 'ready',
      embedHtml: official.html,
      authorName: official.authorName ?? null,
      authorUrl: official.authorUrl ?? null,
      thumbnailUrl: official.thumbnailUrl ?? null,
      errorCode: null,
      fetchedAt,
      expiresAt: new Date(nowMs + INSTAGRAM_EMBED_SUCCESS_TTL_MS).toISOString(),
    };
  } catch (error) {
    const errorCode = error instanceof InstagramEmbedError ? error.code : 'meta_fetch_failed';
    row = {
      canonicalUrl: parsed.canonicalUrl,
      resourceType: parsed.resourceType,
      status: 'unavailable',
      embedHtml: null,
      authorName: null,
      authorUrl: null,
      thumbnailUrl: null,
      errorCode,
      fetchedAt,
      expiresAt: new Date(nowMs + INSTAGRAM_EMBED_FAILURE_TTL_MS).toISOString(),
    };
  }

  try {
    await dependencies.cache.put(row);
  } catch {
    // Fresh, validated data is still safe to return when the cache is temporarily unavailable.
  }
  return responseFromCacheRow(row, false);
}

export function createSlidingWindowRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, { startedAt: number; count: number }>();
  return (key: string, nowMs = Date.now()): boolean => {
    const existing = buckets.get(key);
    if (!existing || nowMs - existing.startedAt >= windowMs) {
      buckets.set(key, { startedAt: nowMs, count: 1 });
      return true;
    }
    if (existing.count >= limit) return false;
    existing.count += 1;
    if (buckets.size > 2000) {
      for (const [bucketKey, bucket] of buckets) {
        if (nowMs - bucket.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}
