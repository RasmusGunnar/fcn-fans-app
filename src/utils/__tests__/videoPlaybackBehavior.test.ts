import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFeedVideoPresentation,
  buildMediaViewerParams,
  selectActiveInlineVideoKey,
  toggleVideoMuted,
  VIDEO_MUTED_BY_DEFAULT,
} from '../videoPlaybackBehavior';

test('feed video presentation mounts inline player and autoplays when a video URI exists', () => {
  const presentation = buildFeedVideoPresentation(
    'https://cdn.example.com/video.mp4',
    'https://cdn.example.com/video.thumb.jpg',
  );

  assert.equal(presentation.canOpen, true);
  assert.equal(presentation.mountsInlinePlayer, true);
  assert.equal(presentation.autoplay, true);
  assert.equal(presentation.posterUri, 'https://cdn.example.com/video.thumb.jpg');
});

test('feed video mounts inline player even when no poster thumbnail exists', () => {
  const presentation = buildFeedVideoPresentation('https://cdn.example.com/video.mp4', null);

  assert.equal(presentation.canOpen, true);
  assert.equal(presentation.posterUri, null);
  assert.equal(presentation.mountsInlinePlayer, true);
  assert.equal(presentation.autoplay, true);
});

test('feed video presentation is poster-only when no video URI is provided', () => {
  const presentation = buildFeedVideoPresentation(null, 'https://cdn.example.com/video.thumb.jpg');

  assert.equal(presentation.canOpen, false);
  assert.equal(presentation.mountsInlinePlayer, false);
  assert.equal(presentation.autoplay, false);
});

test('video playback is muted by default', () => {
  assert.equal(VIDEO_MUTED_BY_DEFAULT, true);
  assert.equal(toggleVideoMuted(VIDEO_MUTED_BY_DEFAULT), false);
  assert.equal(toggleVideoMuted(false), true);
});

test('inline autoplay accounts for a feed section offset inside a ScrollView', () => {
  const layouts = {
    'post:video-1': { y: 0, height: 400 },
  };

  assert.equal(selectActiveInlineVideoKey(layouts, 0, 800, 1200), null);
  assert.equal(selectActiveInlineVideoKey(layouts, 900, 800, 1200), 'post:video-1');
});

test('inline autoplay selects only the first sufficiently visible video', () => {
  const layouts = {
    'post:video-1': { y: 0, height: 500 },
    'post:video-2': { y: 550, height: 400 },
  };

  assert.equal(selectActiveInlineVideoKey(layouts, 0, 800), 'post:video-1');
  assert.equal(selectActiveInlineVideoKey(layouts, 500, 800), 'post:video-2');
});

test('tapping a feed video routes the selected video through MediaViewer', () => {
  const items = [
    { type: 'video' as const, uri: 'https://cdn.example.com/video.mp4' },
    { type: 'image' as const, uri: 'https://cdn.example.com/image.jpg' },
  ];

  assert.deepEqual(buildMediaViewerParams(items, 0, 'post-1'), {
    items,
    initialIndex: 0,
    postId: 'post-1',
  });
  assert.equal(buildMediaViewerParams([], 0, 'post-1'), null);
});
