import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInstagramEmbedDocument,
  getInstagramEmbedUiState,
  INSTAGRAM_EMBED_MAX_HEIGHT,
  INSTAGRAM_EMBED_MIN_HEIGHT,
  isAllowedInstagramEmbedNavigation,
  parseInstagramEmbedHeightMessage,
  sanitizeInstagramEmbedMarkup,
  validateInstagramEmbedResponse,
} from '../instagramEmbed';

const URL = 'https://www.instagram.com/p/ABCDE_12/';
const HTML = `<blockquote class="instagram-media" data-instgrm-permalink="${URL}"><div>Post</div></blockquote>`;

test('validates controlled ready and unavailable response unions', () => {
  const ready = validateInstagramEmbedResponse(
    {
      status: 'ready',
      canonicalUrl: URL,
      resourceType: 'post',
      html: HTML,
      fetchedAt: '2026-08-11T12:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
      cached: false,
      thumbnailUrl: 'https://scontent.cdninstagram.com/thumb.jpg?sig=ok',
    },
    URL,
  );
  assert.equal(ready?.status, 'ready');

  const unavailable = validateInstagramEmbedResponse(
    {
      status: 'unavailable',
      canonicalUrl: URL,
      resourceType: 'post',
      reason: 'private_or_unavailable',
      retryAfter: '2026-08-11T12:10:00.000Z',
      cached: true,
    },
    URL,
  );
  assert.equal(unavailable?.status, 'unavailable');
});

test('rejects a mismatched URL, unsafe thumbnail and arbitrary HTML', () => {
  assert.equal(
    validateInstagramEmbedResponse(
      {
        status: 'ready',
        canonicalUrl: 'https://www.instagram.com/p/OTHER_12/',
        resourceType: 'post',
        html: HTML,
        fetchedAt: '2026-08-11T12:00:00.000Z',
        expiresAt: '2026-08-12T00:00:00.000Z',
        cached: false,
      },
      URL,
    ),
    null,
  );
  assert.equal(sanitizeInstagramEmbedMarkup('<iframe src="https://evil.test"></iframe>'), null);
  assert.equal(sanitizeInstagramEmbedMarkup('<script>alert(1)</script>'), null);
});

test('builds a shell with only the official Instagram script and a restrictive CSP', () => {
  const document = buildInstagramEmbedDocument(
    `${HTML}<script src="https://evil.test/tracker.js"></script>`,
  );
  assert.ok(document);
  assert.match(document, /https:\/\/www\.instagram\.com\/embed\.js/);
  assert.doesNotMatch(document, /evil\.test/);
  assert.match(document, /Content-Security-Policy/);
  assert.match(document, /ReactNativeWebView\.postMessage/);
});

test('accepts only strict finite height messages and clamps their range', () => {
  assert.equal(
    parseInstagramEmbedHeightMessage(JSON.stringify({ type: 'height', height: 100 })),
    INSTAGRAM_EMBED_MIN_HEIGHT,
  );
  assert.equal(
    parseInstagramEmbedHeightMessage(JSON.stringify({ type: 'height', height: 5000 })),
    INSTAGRAM_EMBED_MAX_HEIGHT,
  );
  assert.equal(parseInstagramEmbedHeightMessage('{"type":"url","height":400}'), null);
  assert.equal(parseInstagramEmbedHeightMessage('{"type":"height","height":"400"}'), null);
  assert.equal(parseInstagramEmbedHeightMessage('{"type":"height","height":400,"url":"x"}'), null);
});

test('allows only internal official embed navigation', () => {
  assert.equal(isAllowedInstagramEmbedNavigation('about:blank'), true);
  assert.equal(
    isAllowedInstagramEmbedNavigation('https://www.instagram.com/p/ABCDE_12/embed/'),
    true,
  );
  assert.equal(
    isAllowedInstagramEmbedNavigation('https://instagram.com.evil.test/p/x/embed/'),
    false,
  );
  assert.equal(isAllowedInstagramEmbedNavigation('file:///tmp/embed.html'), false);
  assert.equal(isAllowedInstagramEmbedNavigation('fcnfans://incoming-share'), false);
});

test('maps lazy, loading, ready and failed requests to deterministic UI states', () => {
  assert.equal(getInstagramEmbedUiState(false, 'idle'), 'placeholder');
  assert.equal(getInstagramEmbedUiState(true, 'loading'), 'loading');
  assert.equal(getInstagramEmbedUiState(true, 'ready'), 'ready');
  assert.equal(getInstagramEmbedUiState(true, 'unavailable'), 'fallback');
  assert.equal(getInstagramEmbedUiState(true, 'error'), 'fallback');
});
