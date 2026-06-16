import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeedItem } from '../../types/feed';
import type { PostType } from '../../types/post';
import { reconcileFeedItemIdentities } from '../feedPublication';
import { filterHomeFeedItems } from '../homeFeedFilter';

function createPostItem(id: string, postType: PostType, createdAt: string): FeedItem {
  return {
    kind: 'post',
    id,
    data: {
      id,
      postType,
      authorName: 'Fan',
      createdAt,
      text: id,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    },
  };
}

function createWeeklyTopFanItem(id: string, weekStartDate: string): FeedItem {
  return {
    kind: 'weekly_top_fan',
    id,
    data: {
      id,
      weekStartDate,
      generatedAt: '2026-05-27T10:00:00.000Z',
      userId: 'fan-1',
      displayName: 'Fan',
      fanLevelKey: 'new_fan',
      weeklyScore: 2,
      reasonType: 'activity',
      referencePostId: null,
      referenceCommentId: null,
      title: 'Ugens topfan',
      subtitle: 'Fan har v\u00e6ret aktiv',
      body: 'Aktiv i f\u00e6llesskabet',
      ctaLabel: 'Se profil',
      isPublished: true,
      createdAt: '2026-05-27T10:00:00.000Z',
      isSystemCard: true,
      isFallbackLatest: true,
      expectedWeekStart: '2026-06-01',
    },
  };
}

const mixedFeed: FeedItem[] = [
  createPostItem('fan-old', 'post', '2026-06-08T10:00:00.000Z'),
  createWeeklyTopFanItem('weekly-top-fan-fallback', '2026-05-18'),
  {
    kind: 'news',
    id: 'news-1',
    data: {
      id: 'news-1',
      title: 'News',
      url: 'https://example.com/news',
      createdBy: 'author-1',
      actorType: 'user',
      actorId: 'author-1',
      actorName: 'Author',
      createdAt: '2026-06-09T12:00:00.000Z',
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    },
  },
  createPostItem('article-new', 'media_article', '2026-06-09T11:00:00.000Z'),
  createPostItem('fan-new', 'post', '2026-06-09T10:00:00.000Z'),
  createPostItem('article-old', 'media_article', '2026-06-07T10:00:00.000Z'),
];

test('Alle preserves the existing mixed feed reference and order', () => {
  const result = filterHomeFeedItems(mixedFeed, 'all');

  assert.equal(result, mixedFeed);
  assert.deepEqual(
    result.map((item) => item.id),
    mixedFeed.map((item) => item.id),
  );
});

test('Fan Posts includes only normal posts sorted newest first', () => {
  const result = filterHomeFeedItems(mixedFeed, 'fan_posts');

  assert.deepEqual(
    result.map((item) => item.id),
    ['fan-new', 'fan-old'],
  );
  assert.ok(result.every((item) => item.kind === 'post' && item.data.postType === 'post'));
});

test('FCN i medierne includes only media articles sorted newest first', () => {
  const result = filterHomeFeedItems(mixedFeed, 'media_articles');

  assert.deepEqual(
    result.map((item) => item.id),
    ['article-new', 'article-old'],
  );
  assert.ok(result.every((item) => item.kind === 'post' && item.data.postType === 'media_article'));
});

test('Weekly Top Fan fallback stays in Alle and out of specialized post tabs', () => {
  const allItems = filterHomeFeedItems(mixedFeed, 'all');
  const fanPosts = filterHomeFeedItems(mixedFeed, 'fan_posts');
  const mediaArticles = filterHomeFeedItems(mixedFeed, 'media_articles');

  assert.ok(
    allItems.some(
      (item) => item.kind === 'weekly_top_fan' && item.data.isFallbackLatest === true,
    ),
  );
  assert.ok(fanPosts.every((item) => item.kind !== 'weekly_top_fan'));
  assert.ok(mediaArticles.every((item) => item.kind !== 'weekly_top_fan'));
});

test('secondary publication preserves unchanged card identities', () => {
  const previousItems: FeedItem[] = [
    createPostItem('fan-1', 'post', '2026-06-09T10:00:00.000Z'),
    createPostItem('article-1', 'media_article', '2026-06-09T11:00:00.000Z'),
  ];
  const nextItems: FeedItem[] = previousItems.map(
    (item) =>
      ({
        ...item,
        data: { ...item.data },
      }) as FeedItem,
  );

  const result = reconcileFeedItemIdentities(previousItems, nextItems);

  assert.equal(result, previousItems);
  assert.equal(result[0], previousItems[0]);
  assert.equal(result[1], previousItems[1]);
});

test('secondary publication replaces only changed cards', () => {
  const previousItems: FeedItem[] = [
    createPostItem('fan-1', 'post', '2026-06-09T10:00:00.000Z'),
    createPostItem('article-1', 'media_article', '2026-06-09T11:00:00.000Z'),
  ];
  const changedArticle = {
    ...previousItems[1],
    data: {
      ...previousItems[1].data,
      likesCount: 2,
    },
  } as FeedItem;

  const result = reconcileFeedItemIdentities(previousItems, [
    { ...previousItems[0], data: { ...previousItems[0].data } } as FeedItem,
    changedArticle,
  ]);

  assert.notEqual(result, previousItems);
  assert.equal(result[0], previousItems[0]);
  assert.equal(result[1], changedArticle);
});
