import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getFeedItemKey, type FeedItem } from '../../types/feed';
import {
  FEED_IMAGE_FALLBACK_ASPECT_RATIO,
  FEED_VIDEO_FALLBACK_ASPECT_RATIO,
  resolveFeedImageAspectRatio,
  resolveFeedVideoAspectRatio,
  type MediaItem,
} from '../postMediaMapping';
import { resolveFeedVideoLifecycle } from '../videoPlaybackBehavior';

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

test('video poster, loading and player phases resolve one pre-paint geometry', () => {
  const cases: { media: MediaItem | undefined; expected: number }[] = [
    { media: undefined, expected: FEED_VIDEO_FALLBACK_ASPECT_RATIO },
    { media: { type: 'video', width: 0, height: 1920 }, expected: 4 / 5 },
    {
      media: { type: 'video', width: 0, height: 0, metadata: { width: 1920, height: 1080 } },
      expected: 16 / 9,
    },
    {
      media: { type: 'video', width: 1920, height: 0, metadata: { width: 1080, height: 1920 } },
      expected: 4 / 5,
    },
    { media: { type: 'video', width: 1080, height: 1920 }, expected: 4 / 5 },
    { media: { type: 'video', metadata: { width: 1080, height: 1080 } }, expected: 1 },
    { media: { type: 'video', width: 1920, height: 1080 }, expected: 16 / 9 },
  ];

  for (const { media, expected } of cases) {
    const reservedRatio = resolveFeedVideoAspectRatio(media);
    assert.equal(reservedRatio, expected);
    assert.deepEqual(
      ['poster', 'loading', 'playing', 'background', 'foreground'].map(() => reservedRatio),
      [expected, expected, expected, expected, expected],
    );
  }
});

test('video keeps one React geometry shell while native resources are visibility-gated', () => {
  const card = readWorkspaceFile('src/components/cards/FanPostCard.tsx');
  const video = readWorkspaceFile('src/components/feed/FeedVideo.tsx');

  assert.equal((card.match(/<FeedVideo\b/g) ?? []).length, 1);
  assert.match(
    card,
    /<CardMedia fullBleed aspectRatio=\{videoAspectRatio\}>[\s\S]*?<FeedVideo[\s\S]*?aspectRatio=\{videoAspectRatio\}/,
  );
  assert.match(video, /<View style=\{\[styles\.container, \{ aspectRatio \}\]\}>/);
  assert.equal((video.match(/\n\s*<Video\s/g) ?? []).length, 1);
  assert.match(video, /\{mountsPlayer \? \(\s*<ActiveFeedVideoPlayer/);
  assert.match(video, /key=\{uri\}/);
  assert.match(video, /function ActiveFeedVideoPlayer/);
  assert.match(video, /source=\{source\}/);
  assert.doesNotMatch(video, /setDetectedRatio|naturalSize|ratioToNumber/);
  assert.doesNotMatch(video, /setStatusAsync|unloadAsync|source=\{undefined\}/);
});

test('video background and foreground pause playback without resetting shell geometry', () => {
  const video = readWorkspaceFile('src/components/feed/FeedVideo.tsx');

  const active = resolveFeedVideoLifecycle(true, true, false);
  const background = resolveFeedVideoLifecycle(true, false, false);
  const foreground = resolveFeedVideoLifecycle(true, true, false);

  assert.equal(active.mountsPlayer, true);
  assert.equal(background.mountsPlayer, true);
  assert.equal(background.shouldPlay, false);
  assert.equal(background.isMuted, true);
  assert.deepEqual(foreground, active);
  assert.match(video, /onMount=\{markFirstFrameLoading\}/);
  assert.match(video, /useLayoutEffect\([\s\S]*?onMount\(\)[\s\S]*?mountedRef\.current = false/);
  assert.match(video, /if \(mountedRef\.current\) onReady\(\)/);
  assert.match(video, /\{shouldPlay \? \(\s*<Pressable[\s\S]*?styles\.muteButton/);
});

test('image loading, loaded and error phases retain the persisted or fallback ratio', () => {
  assert.equal(resolveFeedImageAspectRatio(undefined), FEED_IMAGE_FALLBACK_ASPECT_RATIO);
  assert.equal(resolveFeedImageAspectRatio({ width: 100, height: 1000 }), 4 / 5);
  assert.equal(resolveFeedImageAspectRatio({ width: 1000, height: 100 }), 1.91);
  assert.equal(resolveFeedImageAspectRatio({ width: 1200, height: 1000 }), 1.2);

  const card = readWorkspaceFile('src/components/cards/FanPostCard.tsx');
  assert.match(
    card,
    /\) : imageUrl \? \(\s*<CardMedia fullBleed aspectRatio=\{imageAspectRatio\}>[\s\S]*?imageLoadError \? \(/,
  );
  assert.doesNotMatch(card, /imageLoadError && __DEV__/);
  assert.match(card, /failedImageUrl === imageUrl/);
  assert.match(card, /setFailedImageUrl\(imageUrl\)/);
});

test('long post text is clamped on initial paint and measured outside layout', () => {
  const card = readWorkspaceFile('src/components/cards/FanPostCard.tsx');

  assert.match(
    card,
    /const bodyNumberOfLines =\s*!isMediaArticle && !isBodyExpanded \? POST_BODY_COLLAPSED_LINES : undefined;/,
  );
  assert.match(
    card,
    /style=\{styles\.bodyMeasureLayer\}[\s\S]*?onTextLayout=\{handleBodyTextLayout\}/,
  );
  assert.match(card, /bodyMeasureLayer:\s*\{[\s\S]*?position: 'absolute'/);
});

test('feed cell identity stays kind:id across media and visibility state changes', () => {
  const initial = { kind: 'post', id: 'shared-id', data: {} } as FeedItem;
  const updated = {
    kind: 'post',
    id: 'shared-id',
    data: { media: [{ type: 'video', width: 1920, height: 1080 }] },
  } as FeedItem;
  const otherKind = { kind: 'news', id: 'shared-id', data: {} } as FeedItem;

  assert.equal(getFeedItemKey(initial), 'post:shared-id');
  assert.equal(getFeedItemKey(updated), getFeedItemKey(initial));
  assert.equal(getFeedItemKey(otherKind), 'news:shared-id');

  const home = readWorkspaceFile('src/screens/HomeScreen.tsx');
  assert.match(home, /keyExtractor=\{getFeedItemKey\}/);
  assert.doesNotMatch(home, /keyExtractor=\{\([^)]*index/);
});

test('fixture header loading and loaded states are mutually exclusive', () => {
  const home = readWorkspaceFile('src/screens/HomeScreen.tsx');

  assert.match(
    home,
    /useState\(true\).*loadingFixture|\[loadingFixture, setLoadingFixture\] = useState\(true\)/,
  );
  assert.match(home, /\{loadingFixture && !matchForBadge \? \(/);
});
