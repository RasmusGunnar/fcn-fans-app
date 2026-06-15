import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeedItem } from '../../types/feed';
import {
  buildHomeStartupMediaAudit,
  getFeedItemVisibleMediaKind,
} from '../homeStartupPerformance';

const mediaArticle: FeedItem = {
  kind: 'post',
  id: 'article-1',
  data: {
    id: 'article-1',
    postType: 'media_article',
    authorName: 'Admin',
    createdAt: '2026-06-10T08:00:00.000Z',
    text: '',
    linkPreview: {
      url: 'https://bold.dk/article',
      faviconUrl: 'https://bold.dk/favicon.ico',
    },
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
  },
};

const videoPost: FeedItem = {
  kind: 'post',
  id: 'video-1',
  data: {
    id: 'video-1',
    postType: 'post',
    authorName: 'Fan',
    createdAt: '2026-06-10T07:00:00.000Z',
    text: '',
    media: [
      {
        type: 'video',
        bucket: 'post-media',
        path: 'video.mp4',
      },
    ],
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
  },
};

test('startup media audit keeps publisher avatars and media preparation lazy', () => {
  const audit = buildHomeStartupMediaAudit([mediaArticle, videoPost]);

  assert.equal(audit.initialMediaArticleCount, 1);
  assert.equal(audit.initialVideoCount, 1);
  assert.equal(audit.eagerFaviconRequestCount, 0);
  assert.equal(audit.eagerMediaPrefetchCount, 0);
  assert.equal(audit.inlinePlayerMountCount, 0);
});

test('visible media classification does not turn media articles into feed videos', () => {
  assert.equal(getFeedItemVisibleMediaKind(mediaArticle), 'article-preview');
  assert.equal(getFeedItemVisibleMediaKind(videoPost), 'video');
});
