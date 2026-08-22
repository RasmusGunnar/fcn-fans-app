import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {
  buildInstagramEmbedDocument,
  getInstagramEmbedUiState,
  INSTAGRAM_EMBED_SCRIPT_URL,
  INSTAGRAM_EMBED_MAX_HEIGHT,
  INSTAGRAM_EMBED_MIN_HEIGHT,
  parseInstagramEmbedHeightMessage,
  sanitizeInstagramEmbedMarkup,
  validateInstagramEmbedResponse,
} from '../instagramEmbed';
import {
  getInstagramEmbedNavigationDecision,
  INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT,
  INSTAGRAM_EMBED_ORIGIN_WHITELIST,
  INSTAGRAM_EMBED_SHELL_URL,
  instagramEmbedWebViewNavigationHandlers,
  openCanonicalInstagramUrlFromExplicitCta,
  shouldRecoverInstagramEmbedMainDocument,
} from '../instagramNavigation';

const URL = 'https://www.instagram.com/p/ABCDE_12/';
const HTML = `<blockquote class="instagram-media" data-instgrm-permalink="${URL}"><div>Post</div></blockquote>`;

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

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
  assert.match(document, /__FCN_INSTAGRAM_NAVIGATION_GUARD__/);
  assert.match(document, /img-src https:\/\/www\.instagram\.com/);
  assert.doesNotMatch(document, /img-src https: data:/);
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

test('allows the controlled shell and only explicit official embed subframes', () => {
  assert.equal(INSTAGRAM_EMBED_SHELL_URL, 'https://fcn-fans.invalid/instagram-embed-shell/');
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: INSTAGRAM_EMBED_SHELL_URL,
      isTopFrame: true,
      navigationType: 'other',
    }).action,
    'allow',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/p/ABCDE_12/embed/',
      isTopFrame: false,
    }).action,
    'allow',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/reel/ABCDE_12/embed/captioned/?utm_source=ig_embed',
      isTopFrame: false,
    }).action,
    'allow',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/fcntraining/embed/',
      isTopFrame: false,
    }).action,
    'allow',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/p/ABCDE_12/embed/',
      isTopFrame: true,
    }).action,
    'block',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/p/ABCDE_12/embed/',
    }).action,
    'block',
  );
  assert.equal(
    getInstagramEmbedNavigationDecision({
      kind: 'navigation',
      url: 'https://www.instagram.com/accounts/login/',
      isTopFrame: false,
    }).action,
    'block',
  );
});

test('allows only safe resources required by the official embed document', () => {
  const document = buildInstagramEmbedDocument(HTML);
  assert.ok(document);
  assert.match(document, new RegExp(`<script async src="${INSTAGRAM_EMBED_SCRIPT_URL}"`));
  assert.match(document, /script-src 'nonce-fcn-height' https:\/\/www\.instagram\.com/);
  assert.match(
    document,
    /img-src https:\/\/www\.instagram\.com https:\/\/instagram\.com https:\/\/\*\.cdninstagram\.com https:\/\/\*\.fbcdn\.net data:/,
  );
  assert.match(document, /frame-src https:\/\/www\.instagram\.com https:\/\/instagram\.com/);
  assert.match(document, /connect-src[^;]+\*\.cdninstagram\.com[^;]+\*\.fbcdn\.net/);
  assert.match(document, /media-src[^;]+\*\.cdninstagram\.com[^;]+\*\.fbcdn\.net/);
  assert.match(document, /font-src[^;]+\*\.cdninstagram\.com[^;]+\*\.fbcdn\.net/);
  assert.doesNotMatch(document, /evil\.test|script-src[^;]+https:\/\/\*/);

  const csp = document.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of csp
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)) {
    const [, ...sources] = directive.split(/\s+/);
    assert.equal(sources.includes('*'), false, directive);
    assert.equal(sources.includes('https:'), false, directive);
  }
});

test('blocks main-frame Instagram, deep-link, intent and custom-scheme navigation', () => {
  const blocked = [
    { url: URL, isTopFrame: true },
    { url: 'https://www.instagram.com/', isTopFrame: true },
    { url: 'instagram://media?id=ABCDE_12', isTopFrame: true },
    { url: 'intent://instagram.com/p/ABCDE_12/#Intent;scheme=https;end', isTopFrame: true },
    { url: 'fcnfans://incoming-share', isTopFrame: true },
    { url: 'https://instagram.com.evil.test/p/ABCDE_12/', isTopFrame: true },
    { url: 'instagram://media?id=ABCDE_12', isTopFrame: false },
    { url: 'intent://instagram.com/p/ABCDE_12/#Intent;scheme=https;end', isTopFrame: false },
  ];
  for (const request of blocked) {
    assert.equal(
      instagramEmbedWebViewNavigationHandlers.onShouldStartLoadWithRequest(request),
      false,
      request.url,
    );
  }
});

test('blocks target blank and window.open without any external-open side effect', () => {
  assert.deepEqual([...INSTAGRAM_EMBED_ORIGIN_WHITELIST], ['*']);
  assert.equal(
    getInstagramEmbedNavigationDecision({ kind: 'open-window', url: URL }).action,
    'block',
  );
  instagramEmbedWebViewNavigationHandlers.onOpenWindow({ nativeEvent: { targetUrl: URL } });
  assert.match(INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT, /window\.open = function/);
  assert.match(INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT, /blockAnchorNavigation/);

  type GuardEvent = {
    target: unknown;
    preventDefault: () => void;
    stopPropagation: () => void;
    stopImmediatePropagation: () => void;
  };
  type GuardListener = (event: GuardEvent) => unknown;
  const listeners = new Map<string, GuardListener>();
  let registrations = 0;
  const documentObject = {
    addEventListener(type: string, listener: GuardListener) {
      registrations += 1;
      listeners.set(type, listener);
    },
  };
  const windowObject: Record<string, unknown> = {};
  const context = vm.createContext({ document: documentObject, window: windowObject });
  vm.runInContext(INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT, context);
  vm.runInContext(INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT, context);
  assert.equal(registrations, 2, 'the guard installs click handlers only once');
  assert.equal(typeof windowObject.open, 'function');
  assert.equal((windowObject.open as () => unknown)(), null);

  const calls: string[] = [];
  const anchor = { nodeType: 1, tagName: 'A', parentElement: documentObject };
  const result = listeners.get('click')?.({
    target: anchor,
    preventDefault: () => calls.push('preventDefault'),
    stopPropagation: () => calls.push('stopPropagation'),
    stopImmediatePropagation: () => calls.push('stopImmediatePropagation'),
  });
  assert.equal(result, false);
  assert.deepEqual(calls, ['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);

  const renderer = readWorkspaceFile('src/components/shared/InstagramEmbedRenderer.tsx');
  assert.match(renderer, /originWhitelist=\{INSTAGRAM_EMBED_ORIGIN_WHITELIST\}/);
  assert.match(
    renderer,
    /onShouldStartLoadWithRequest=\{\s*instagramEmbedWebViewNavigationHandlers\.onShouldStartLoadWithRequest\s*\}/,
  );
  assert.match(renderer, /onOpenWindow=\{instagramEmbedWebViewNavigationHandlers\.onOpenWindow\}/);
  assert.match(renderer, /onNavigationStateChange=\{/);
  assert.match(renderer, /shouldRecoverInstagramEmbedMainDocument\(url\)/);
  assert.match(renderer, /setSupportMultipleWindows/);
  assert.doesNotMatch(renderer, /setSupportMultipleWindows=\{false\}/);
  assert.match(
    renderer,
    /injectedJavaScriptBeforeContentLoaded=\{INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT\}/,
  );
  assert.match(renderer, /injectedJavaScriptBeforeContentLoadedForMainFrameOnly=\{false\}/);
  assert.match(renderer, /allowsLinkPreview=\{false\}/);
  assert.doesNotMatch(renderer, /Linking|openInstagramFromExplicitCta/);
});

test('render, reload and resume checks keep the same side-effect-free policy', () => {
  const checks = [
    { url: INSTAGRAM_EMBED_SHELL_URL, isTopFrame: true, expected: true },
    { url: INSTAGRAM_EMBED_SHELL_URL, isTopFrame: true, expected: true },
    { url: URL, isTopFrame: true, expected: false },
    { url: 'instagram://media?id=ABCDE_12', isTopFrame: true, expected: false },
  ];
  for (const check of checks) {
    assert.equal(
      instagramEmbedWebViewNavigationHandlers.onShouldStartLoadWithRequest(check),
      check.expected,
    );
  }
  assert.equal(shouldRecoverInstagramEmbedMainDocument(INSTAGRAM_EMBED_SHELL_URL), false);
  assert.equal(shouldRecoverInstagramEmbedMainDocument('about:blank'), true);
  assert.equal(shouldRecoverInstagramEmbedMainDocument(URL), true);
  assert.equal(
    shouldRecoverInstagramEmbedMainDocument('https://www.instagram.com/p/ABCDE_12/embed/'),
    true,
  );
});

test('the explicit FCN CTA opens one canonical Instagram URL', async () => {
  const opened: string[] = [];
  const didOpen = await openCanonicalInstagramUrlFromExplicitCta(
    'https://instagram.com/reels/ABCDE_12/?igsh=tracking#fragment',
    async (canonicalUrl) => {
      opened.push(canonicalUrl);
    },
  );
  assert.equal(didOpen, true);
  assert.deepEqual(opened, ['https://www.instagram.com/reel/ABCDE_12/']);

  const invalidDidOpen = await openCanonicalInstagramUrlFromExplicitCta(
    'https://instagram.com.evil.test/p/ABCDE_12/',
    async (canonicalUrl) => {
      opened.push(canonicalUrl);
    },
  );
  assert.equal(invalidDidOpen, false);
  assert.equal(opened.length, 1);
});

test('feed and modal route rich content through the same safe renderer and CTA', () => {
  const feed = readWorkspaceFile('src/components/cards/FanPostCard.tsx');
  const embedCard = readWorkspaceFile('src/components/shared/InstagramEmbedCard.tsx');
  const modal = readWorkspaceFile('src/components/shared/InstagramEmbedModal.tsx');
  const renderer = readWorkspaceFile('src/components/shared/InstagramEmbedRenderer.tsx');
  const openButton = readWorkspaceFile('src/components/shared/InstagramOpenButton.tsx');

  assert.match(
    feed,
    /<InstagramEmbedCard attachment=\{instagramShare\} enabled=\{isInstagramEmbedActive\}/,
  );
  assert.match(feed, /if \(parseInstagramUrl\(url\)\) return/);
  assert.match(feed, /segment\.type === 'url' && !parseInstagramUrl\(segment\.url\)/);
  assert.match(embedCard, /<InstagramEmbedRenderer embed=\{request\.embed\}/);
  assert.match(embedCard, /<InstagramOpenButton canonicalUrl=\{request\.embed\.canonicalUrl\}/);
  assert.match(embedCard, /<InstagramOpenButton canonicalUrl=\{attachment\.canonicalUrl\}/);
  assert.match(modal, /<InstagramEmbedCard attachment=\{attachment\} enabled=\{visible\}/);
  assert.doesNotMatch(modal, /Linking|openInstagramFromExplicitCta/);
  assert.match(openButton, /Åbn på Instagram/);
  assert.doesNotMatch(renderer, /Linking|openInstagramFromExplicitCta/);
});

test('preview surfaces stay in FCN Fans or remain inert', () => {
  const preview = readWorkspaceFile('src/components/shared/InstagramEmbedPreview.tsx');
  const conversation = readWorkspaceFile('src/screens/ConversationScreen.tsx');

  assert.doesNotMatch(preview, /Linking|openInstagramFromExplicitCta/);
  assert.match(preview, /onPress=\{onPress\}/);
  assert.match(preview, /disabled=\{!onPress\}/);
  assert.match(
    conversation,
    /attachment=\{item\.externalShare\}[\s\S]*?onPress=\{\(\) => setSelectedInstagramShare\(item\.externalShare \?\? null\)\}/,
  );
});

test('fallback and rich CTAs use the sole centralized Linking path', () => {
  const embedCard = readWorkspaceFile('src/components/shared/InstagramEmbedCard.tsx');
  const fallback = readWorkspaceFile('src/components/shared/InstagramCard.tsx');
  const renderer = readWorkspaceFile('src/components/shared/InstagramEmbedRenderer.tsx');
  const preview = readWorkspaceFile('src/components/shared/InstagramEmbedPreview.tsx');
  const modal = readWorkspaceFile('src/components/shared/InstagramEmbedModal.tsx');
  const openButton = readWorkspaceFile('src/components/shared/InstagramOpenButton.tsx');
  const externalNavigation = readWorkspaceFile('src/services/instagramExternalNavigation.ts');

  assert.match(
    embedCard,
    /return <InstagramCard attachment=\{attachment\} onRemove=\{onRemove\} unavailable \/>/,
  );
  assert.match(
    embedCard,
    /if \(uiState === 'placeholder'\) \{\s*return <InstagramCard attachment=\{attachment\} onRemove=\{onRemove\} \/>/,
  );
  assert.match(fallback, /<InstagramOpenButton canonicalUrl=\{validated\.canonicalUrl\} \/>/);
  assert.match(
    openButton,
    /onPress=\{\(\) => \{[\s\S]*?openInstagramFromExplicitCta\(validated\.canonicalUrl\)/,
  );
  assert.equal(
    (openButton.match(/openInstagramFromExplicitCta\(validated\.canonicalUrl\)/g) ?? []).length,
    1,
  );
  assert.equal(
    (
      [embedCard, modal, preview, fallback, renderer, openButton, externalNavigation]
        .join('\n')
        .match(/Linking\.openURL/g) ?? []
    ).length,
    1,
  );
});

test('maps lazy, loading, ready and failed requests to deterministic UI states', () => {
  assert.equal(getInstagramEmbedUiState(false, 'idle'), 'placeholder');
  assert.equal(getInstagramEmbedUiState(true, 'loading'), 'loading');
  assert.equal(getInstagramEmbedUiState(true, 'ready'), 'ready');
  assert.equal(getInstagramEmbedUiState(true, 'unavailable'), 'fallback');
  assert.equal(getInstagramEmbedUiState(true, 'error'), 'fallback');
});
