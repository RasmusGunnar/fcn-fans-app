import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeedPostData } from '../../types/feed';
import {
  getHomePostEngagementScore,
  getHomePostRankingScore,
} from '../homePostRanking';

function createPostItem(
  id: string,
  createdAt: string,
  likeCount: number,
  commentCount = 0,
  postType: FeedPostData['postType'] = 'post',
): FeedPostData {
  return {
    id,
    postType,
    authorName: 'Fan',
    createdAt,
    text: id,
    likesCount: likeCount,
    commentsCount: commentCount,
    likedByMe: false,
    likeCount,
    commentCount,
    engagementCount: likeCount + commentCount,
  };
}

test('an old liked post does not outrank a much newer zero-engagement post', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const oldLikedPost = createPostItem('old-liked', '2026-05-31T12:00:00.000Z', 20);
  const newerPost = createPostItem('new-zero', '2026-06-13T12:00:00.000Z', 0);

  assert.ok(
    getHomePostRankingScore(newerPost, now) >
      getHomePostRankingScore(oldLikedPost, now),
  );
});

test('a recent engaged post can outrank a same-day unengaged post', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const engagedPost = createPostItem('engaged', '2026-06-15T04:00:00.000Z', 5);
  const unengagedPost = createPostItem('unengaged', '2026-06-15T08:00:00.000Z', 0);

  assert.ok(
    getHomePostRankingScore(engagedPost, now) >
      getHomePostRankingScore(unengagedPost, now),
  );
});

test('ordinary post engagement decays after 96 hours and reaches zero at 14 days', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const fiveDayPost = createPostItem('five-days', '2026-06-10T12:00:00.000Z', 20);
  const fourteenDayPost = createPostItem(
    'fourteen-days',
    '2026-06-01T12:00:00.000Z',
    20,
  );

  assert.equal(getHomePostEngagementScore(fiveDayPost, now), 10);
  assert.equal(getHomePostEngagementScore(fourteenDayPost, now), 0);
});

test('five-day-old media article engagement decays', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const mediaArticle = createPostItem(
    'article-five-days',
    '2026-06-10T12:00:00.000Z',
    20,
    0,
    'media_article',
  );

  assert.equal(getHomePostEngagementScore(mediaArticle, now), 10);
});

test('fourteen-day-old media article engagement becomes zero', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const mediaArticle = createPostItem(
    'article-fourteen-days',
    '2026-06-01T12:00:00.000Z',
    20,
    0,
    'media_article',
  );

  assert.equal(getHomePostEngagementScore(mediaArticle, now), 0);
});

test('old engaged media article does not outrank a newer zero-engagement item', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const oldArticle = createPostItem(
    'article-old',
    '2026-02-15T12:00:00.000Z',
    20,
    0,
    'media_article',
  );
  const newerPost = createPostItem('post-newer', '2026-06-13T12:00:00.000Z', 0);

  assert.ok(
    getHomePostRankingScore(newerPost, now) >
      getHomePostRankingScore(oldArticle, now),
  );
});

test('recent engaged media article can outrank a similar-age unengaged item', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const engagedArticle = createPostItem(
    'article-engaged',
    '2026-06-15T04:00:00.000Z',
    5,
    0,
    'media_article',
  );
  const unengagedPost = createPostItem(
    'post-unengaged',
    '2026-06-15T04:00:00.000Z',
    0,
  );

  assert.ok(
    getHomePostRankingScore(engagedArticle, now) >
      getHomePostRankingScore(unengagedPost, now),
  );
});

test('system cards remain exempt from post engagement decay', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const systemCard = {
    ...createPostItem(
      'system-article',
      '2026-06-01T12:00:00.000Z',
      20,
      0,
      'media_article',
    ),
    isSystemCard: true,
  };

  assert.equal(getHomePostEngagementScore(systemCard, now), 20);
});
