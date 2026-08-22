import { parseInstagramUrl } from '../lib/instagram';
import type { InstagramEmbedResponse, RichInstagramResourceType } from '../types/instagramEmbed';
import { INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT } from './instagramNavigation';

export const INSTAGRAM_EMBED_SCRIPT_URL = 'https://www.instagram.com/embed.js';
export const INSTAGRAM_EMBED_MIN_HEIGHT = 220;
export const INSTAGRAM_EMBED_MAX_HEIGHT = 900;
export const INSTAGRAM_EMBED_INITIAL_HEIGHT = 520;
const MAX_EMBED_HTML_BYTES = 200 * 1024;

function byteLength(value: string): number {
  try {
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}|./gi, 'x').length;
  } catch {
    return MAX_EMBED_HTML_BYTES + 1;
  }
}

export function isRichInstagramUrl(rawUrl: string): boolean {
  const parsed = parseInstagramUrl(rawUrl);
  return Boolean(parsed && !parsed.canonicalUrl.includes('/tv/'));
}

export function sanitizeInstagramEmbedMarkup(rawHtml: unknown): string | null {
  if (
    typeof rawHtml !== 'string' ||
    !rawHtml.trim() ||
    byteLength(rawHtml) > MAX_EMBED_HTML_BYTES
  ) {
    return null;
  }
  const sanitized = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();
  if (
    !/<blockquote\b[^>]*class\s*=\s*["'][^"']*\binstagram-media\b[^"']*["'][^>]*>/i.test(
      sanitized,
    ) ||
    /<(?:script|iframe|object|embed|link|meta|base|form)\b/i.test(sanitized) ||
    /(?:javascript|file|data\s*:\s*text\/html)\s*:/i.test(sanitized)
  ) {
    return null;
  }
  return sanitized;
}

function isSafeThumbnailUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return Boolean(
      parsed.protocol === 'https:' &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      (hostname === 'instagram.com' ||
        hostname === 'www.instagram.com' ||
        hostname === 'cdninstagram.com' ||
        hostname.endsWith('.cdninstagram.com') ||
        hostname === 'fbcdn.net' ||
        hostname.endsWith('.fbcdn.net')),
    );
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateInstagramEmbedResponse(
  value: unknown,
  expectedCanonicalUrl: string,
): InstagramEmbedResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const parsed =
    typeof candidate.canonicalUrl === 'string' ? parseInstagramUrl(candidate.canonicalUrl) : null;
  if (
    !parsed ||
    parsed.canonicalUrl !== expectedCanonicalUrl ||
    !isRichInstagramUrl(parsed.canonicalUrl) ||
    candidate.resourceType !== parsed.resourceType ||
    typeof candidate.cached !== 'boolean'
  ) {
    return null;
  }
  const resourceType = parsed.resourceType as RichInstagramResourceType;

  if (candidate.status === 'ready') {
    const html = sanitizeInstagramEmbedMarkup(candidate.html);
    if (!html || !isIsoDate(candidate.fetchedAt) || !isIsoDate(candidate.expiresAt)) return null;
    const authorName =
      typeof candidate.authorName === 'string' && candidate.authorName.trim()
        ? candidate.authorName.trim().slice(0, 100)
        : undefined;
    const author =
      typeof candidate.authorUrl === 'string' ? parseInstagramUrl(candidate.authorUrl) : null;
    const authorUrl = author?.resourceType === 'profile' ? author.canonicalUrl : undefined;
    const thumbnailUrl = isSafeThumbnailUrl(candidate.thumbnailUrl)
      ? candidate.thumbnailUrl
      : undefined;
    return {
      status: 'ready',
      canonicalUrl: parsed.canonicalUrl,
      resourceType,
      html,
      authorName,
      authorUrl,
      thumbnailUrl,
      fetchedAt: candidate.fetchedAt,
      expiresAt: candidate.expiresAt,
      cached: candidate.cached,
    };
  }

  if (
    candidate.status === 'unavailable' &&
    (candidate.reason === 'private_or_unavailable' ||
      candidate.reason === 'temporarily_unavailable') &&
    isIsoDate(candidate.retryAfter)
  ) {
    return {
      status: 'unavailable',
      canonicalUrl: parsed.canonicalUrl,
      resourceType,
      reason: candidate.reason,
      retryAfter: candidate.retryAfter,
      cached: candidate.cached,
    };
  }
  return null;
}

export function parseInstagramEmbedHeightMessage(rawData: unknown): number | null {
  if (typeof rawData !== 'string' || rawData.length > 160) return null;
  try {
    const parsed = JSON.parse(rawData) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.type !== 'height' ||
      typeof record.height !== 'number' ||
      !Number.isFinite(record.height) ||
      Object.keys(record).some((key) => key !== 'type' && key !== 'height')
    ) {
      return null;
    }
    return Math.min(
      INSTAGRAM_EMBED_MAX_HEIGHT,
      Math.max(INSTAGRAM_EMBED_MIN_HEIGHT, Math.ceil(record.height)),
    );
  } catch {
    return null;
  }
}

export function buildInstagramEmbedDocument(rawHtml: string): string | null {
  const markup = sanitizeInstagramEmbedMarkup(rawHtml);
  if (!markup) return null;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fcn-height' https://www.instagram.com; style-src 'unsafe-inline' https://www.instagram.com; img-src https://www.instagram.com https://instagram.com https://*.cdninstagram.com https://*.fbcdn.net data:; media-src https://www.instagram.com https://instagram.com https://*.cdninstagram.com https://*.fbcdn.net; frame-src https://www.instagram.com https://instagram.com; connect-src https://www.instagram.com https://instagram.com https://*.cdninstagram.com https://*.fbcdn.net; font-src https://www.instagram.com https://instagram.com https://*.cdninstagram.com https://*.fbcdn.net; base-uri 'none'; form-action 'none';" />
  <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{width:100%}.instagram-media{margin:0 auto!important;min-width:0!important;width:calc(100% - 2px)!important}</style>
</head>
<body>
  ${markup}
  <script nonce="fcn-height">
    ${INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT}
  </script>
  <script async src="${INSTAGRAM_EMBED_SCRIPT_URL}"></script>
  <script nonce="fcn-height">
    (function () {
      var lastHeight = 0;
      function reportHeight() {
        var height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        if (!Number.isFinite(height) || height <= 0 || Math.abs(height - lastHeight) < 2) return;
        lastHeight = height;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: height }));
      }
      new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
      window.addEventListener('load', reportHeight);
      window.addEventListener('resize', reportHeight);
      reportHeight();
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1500);
    })();
  </script>
</body>
</html>`;
}

export type InstagramEmbedUiState = 'placeholder' | 'loading' | 'ready' | 'fallback';

export function getInstagramEmbedUiState(
  enabled: boolean,
  requestState: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error',
): InstagramEmbedUiState {
  if (!enabled || requestState === 'idle') return 'placeholder';
  if (requestState === 'loading') return 'loading';
  if (requestState === 'ready') return 'ready';
  return 'fallback';
}
