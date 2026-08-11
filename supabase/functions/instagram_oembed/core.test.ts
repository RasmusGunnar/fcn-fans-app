import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createSlidingWindowRateLimiter,
  fetchOfficialInstagramEmbed,
  INSTAGRAM_EMBED_FAILURE_TTL_MS,
  INSTAGRAM_EMBED_MAX_RESPONSE_BYTES,
  INSTAGRAM_EMBED_SUCCESS_TTL_MS,
  InstagramEmbedError,
  META_INSTAGRAM_OEMBED_ENDPOINT,
  parseOfficialInstagramUrl,
  resolveInstagramEmbed,
  type InstagramEmbedCacheRow,
} from './core.js';

const NOW = Date.parse('2026-08-11T12:00:00.000Z');
const SAFE_HTML = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/ABCDE_12/"><div>Officiel post</div></blockquote><script async src="https://www.instagram.com/embed.js"></script>`;

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function createCache(initial?: InstagramEmbedCacheRow) {
  const values = new Map<string, InstagramEmbedCacheRow>();
  if (initial) values.set(initial.canonicalUrl, initial);
  return {
    values,
    adapter: {
      get: async (url: string) => values.get(url) ?? null,
      put: async (row: InstagramEmbedCacheRow) => {
        values.set(row.canonicalUrl, row);
      },
    },
  };
}

test('accepts official post, reel and profile shapes and canonicalizes tracking data', () => {
  assert.deepEqual(parseOfficialInstagramUrl('https://instagram.com/p/ABCDE_12/?igsh=x'), {
    canonicalUrl: 'https://www.instagram.com/p/ABCDE_12/',
    resourceType: 'post',
    externalId: 'ABCDE_12',
  });
  assert.equal(
    parseOfficialInstagramUrl('https://www.instagram.com/reel/FGHIJ_34/').resourceType,
    'reel',
  );
  assert.equal(
    parseOfficialInstagramUrl('https://www.instagram.com/fcnordsjaelland/').resourceType,
    'profile',
  );
});

test('rejects spoofing, local targets, credentials, ports and unsupported routes', () => {
  const invalid = [
    'http://www.instagram.com/p/ABCDE_12/',
    'https://instagram.com.evil.test/p/ABCDE_12/',
    'https://localhost/p/ABCDE_12/',
    'https://127.0.0.1/p/ABCDE_12/',
    'https://user@instagram.com/p/ABCDE_12/',
    'https://instagram.com:444/p/ABCDE_12/',
    'https://www.instagram.com/stories/fcnordsjaelland/123/',
    'https://www.instagram.com/tv/ABCDE_12/',
    'https://www.instagram.com/reels/ABCDE_12/',
    'https://www.instagram.com/direct/',
  ];
  for (const url of invalid) {
    assert.throws(() => parseOfficialInstagramUrl(url), InstagramEmbedError, url);
  }
});

test('calls only the fixed tokenless Meta endpoint and removes Meta scripts', async () => {
  const parsed = parseOfficialInstagramUrl('https://www.instagram.com/p/ABCDE_12/');
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const result = await fetchOfficialInstagramEmbed(parsed, (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestedUrl = String(url);
    requestedInit = init;
    return jsonResponse({
      provider_name: 'Instagram',
      html: SAFE_HTML,
      author_name: 'FC Nordsjælland',
      author_url: 'https://www.instagram.com/fcnordsjaelland/',
      thumbnail_url: 'https://scontent.cdninstagram.com/image.jpg?sig=ok',
    });
  }) as typeof fetch);

  const endpoint = new URL(requestedUrl);
  assert.equal(`${endpoint.origin}${endpoint.pathname}`, META_INSTAGRAM_OEMBED_ENDPOINT);
  assert.equal(endpoint.searchParams.get('url'), parsed.canonicalUrl);
  assert.equal(endpoint.searchParams.has('access_token'), false);
  assert.equal(requestedInit?.redirect, 'manual');
  assert.doesNotMatch(result.html, /<script/i);
  assert.match(result.html, /instagram-media/);
  assert.equal(result.thumbnailUrl, 'https://scontent.cdninstagram.com/image.jpg?sig=ok');
});

test('resolves mocked public post, reel and profile embeds', async () => {
  const urls = [
    'https://www.instagram.com/p/ABCDE_12/',
    'https://www.instagram.com/reel/FGHIJ_34/',
    'https://www.instagram.com/fcnordsjaelland/',
  ];
  for (const url of urls) {
    const result = await resolveInstagramEmbed(
      url,
      {
        cache: createCache().adapter,
        fetchImpl: (async () =>
          jsonResponse({ provider_name: 'Instagram', html: SAFE_HTML })) as typeof fetch,
      },
      NOW,
    );
    assert.equal(result.status, 'ready', url);
  }
});

test('rejects Meta failure, redirect, malformed HTML and oversized responses', async () => {
  const parsed = parseOfficialInstagramUrl('https://www.instagram.com/p/ABCDE_12/');
  const cases: Array<[string, () => Promise<Response>, RegExp]> = [
    ['failure', async () => jsonResponse({}, { status: 403 }), /meta_http_403/],
    [
      'redirect',
      async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://evil.test/proxy' },
        }),
      /meta_redirect_rejected/,
    ],
    [
      'malformed',
      async () => jsonResponse({ provider_name: 'Instagram', html: '<div>not an embed</div>' }),
      /meta_unsafe_html/,
    ],
    [
      'oversized',
      async () =>
        new Response('x', {
          headers: {
            'content-type': 'application/json',
            'content-length': String(INSTAGRAM_EMBED_MAX_RESPONSE_BYTES + 1),
          },
        }),
      /meta_response_too_large/,
    ],
  ];
  for (const [label, response, pattern] of cases) {
    await assert.rejects(
      fetchOfficialInstagramEmbed(parsed, (async () => response()) as typeof fetch),
      pattern,
      label,
    );
  }
});

test('aborts a Meta request after the configured timeout', async () => {
  const parsed = parseOfficialInstagramUrl('https://www.instagram.com/p/ABCDE_12/');
  const neverCompletes = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;
  await assert.rejects(fetchOfficialInstagramEmbed(parsed, neverCompletes, 5), /meta_timeout/);
});

test('returns valid positive cache entries without another Meta request', async () => {
  const cache = createCache({
    canonicalUrl: 'https://www.instagram.com/p/ABCDE_12/',
    resourceType: 'post',
    status: 'ready',
    embedHtml: SAFE_HTML.replace(/<script[\s\S]*?<\/script>/, ''),
    authorName: 'FCN',
    authorUrl: null,
    thumbnailUrl: null,
    errorCode: null,
    fetchedAt: new Date(NOW - 1000).toISOString(),
    expiresAt: new Date(NOW + 1000).toISOString(),
  });
  let fetchCount = 0;
  const result = await resolveInstagramEmbed(
    'https://www.instagram.com/p/ABCDE_12/',
    {
      cache: cache.adapter,
      fetchImpl: (async () => {
        fetchCount += 1;
        return jsonResponse({ html: SAFE_HTML });
      }) as typeof fetch,
    },
    NOW,
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.cached, true);
  assert.equal(fetchCount, 0);
});

test('refreshes expired entries and stores a 12 hour success TTL', async () => {
  const cache = createCache({
    canonicalUrl: 'https://www.instagram.com/reel/FGHIJ_34/',
    resourceType: 'reel',
    status: 'unavailable',
    embedHtml: null,
    authorName: null,
    authorUrl: null,
    thumbnailUrl: null,
    errorCode: 'meta_http_404',
    fetchedAt: new Date(NOW - 2000).toISOString(),
    expiresAt: new Date(NOW - 1000).toISOString(),
  });
  const result = await resolveInstagramEmbed(
    'https://www.instagram.com/reel/FGHIJ_34/',
    {
      cache: cache.adapter,
      fetchImpl: (async () => jsonResponse({ html: SAFE_HTML })) as typeof fetch,
    },
    NOW,
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.cached, false);
  const saved = [...cache.values.values()][0];
  assert.ok(saved);
  assert.equal(Date.parse(saved.expiresAt) - NOW, INSTAGRAM_EMBED_SUCCESS_TTL_MS);
});

test('negative-caches unavailable content for 10 minutes', async () => {
  const cache = createCache();
  let fetchCount = 0;
  const failingFetch = (async () => {
    fetchCount += 1;
    return jsonResponse({}, { status: 404 });
  }) as typeof fetch;
  const first = await resolveInstagramEmbed(
    'https://www.instagram.com/fcnordsjaelland/',
    { cache: cache.adapter, fetchImpl: failingFetch },
    NOW,
  );
  const second = await resolveInstagramEmbed(
    'https://www.instagram.com/fcnordsjaelland/',
    { cache: cache.adapter, fetchImpl: failingFetch },
    NOW + 1000,
  );
  assert.equal(first.status, 'unavailable');
  assert.equal(first.reason, 'private_or_unavailable');
  assert.equal(second.cached, true);
  assert.equal(fetchCount, 1);
  const saved = [...cache.values.values()][0];
  assert.ok(saved);
  assert.equal(Date.parse(saved.expiresAt) - NOW, INSTAGRAM_EMBED_FAILURE_TTL_MS);
});

test('rate limiter is scoped to a key and resets after its window', () => {
  const allow = createSlidingWindowRateLimiter(2, 1000);
  assert.equal(allow('user-a', NOW), true);
  assert.equal(allow('user-a', NOW + 1), true);
  assert.equal(allow('user-a', NOW + 2), false);
  assert.equal(allow('user-b', NOW + 2), true);
  assert.equal(allow('user-a', NOW + 1000), true);
});

test('HTTP handler requires JWT auth and exposes no caller-controlled fetch target', () => {
  const index = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/instagram_oembed/index.ts'),
    'utf8',
  );
  const config = fs.readFileSync(path.resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
  assert.match(index, /auth\.getUser\(\)/);
  assert.match(index, /createSlidingWindowRateLimiter\(30,/);
  assert.doesNotMatch(index, /fetch\s*\(\s*(?:rawUrl|body|req)/);
  assert.match(config, /\[functions\.instagram_oembed\]\s*verify_jwt\s*=\s*true/);
});
