import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { FeedNewsData, FeedPostData } from '../../types/feed';
import {
  getHomeContentEngagementScore,
  getHomeContentRecencyScore,
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

function createNewsItem(
  id: string,
  createdAt: string,
  likeCount: number,
  commentCount = 0,
): FeedNewsData {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    createdBy: 'author-1',
    actorType: 'user',
    actorId: 'author-1',
    actorName: 'Author',
    createdAt,
    likesCount: likeCount,
    commentsCount: commentCount,
    likedByMe: false,
    likeCount,
    commentCount,
    engagementCount: likeCount + commentCount,
  };
}

function getNewsRankingScore(news: FeedNewsData, now: Date): number {
  return (
    getHomeContentRecencyScore(news, now) +
    getHomeContentEngagementScore(news, now)
  );
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

  assert.equal(getHomeContentEngagementScore(fiveDayPost, now), 10);
  assert.equal(getHomeContentEngagementScore(fourteenDayPost, now), 0);
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

  assert.equal(getHomeContentEngagementScore(mediaArticle, now), 10);
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

  assert.equal(getHomeContentEngagementScore(mediaArticle, now), 0);
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

  assert.equal(getHomeContentEngagementScore(systemCard, now), 20);
});

test('five-day-old news engagement decays', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const news = createNewsItem('news-five-days', '2026-06-10T12:00:00.000Z', 20);

  assert.equal(getHomeContentEngagementScore(news, now), 10);
});

test('fourteen-day-old news engagement becomes zero', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const news = createNewsItem('news-fourteen-days', '2026-06-01T12:00:00.000Z', 20);

  assert.equal(getHomeContentEngagementScore(news, now), 0);
});

test('old engaged news does not outrank a newer zero-engagement item', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const oldNews = createNewsItem('news-old', '2026-03-22T12:00:00.000Z', 4, 2);
  const newerNews = createNewsItem('news-newer', '2026-06-13T12:00:00.000Z', 0);

  assert.ok(getNewsRankingScore(newerNews, now) > getNewsRankingScore(oldNews, now));
});

test('recent engaged news can outrank same-age unengaged content', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const engagedNews = createNewsItem('news-engaged', '2026-06-15T04:00:00.000Z', 5);
  const unengagedNews = createNewsItem('news-unengaged', '2026-06-15T04:00:00.000Z', 0);

  assert.ok(
    getNewsRankingScore(engagedNews, now) >
      getNewsRankingScore(unengagedNews, now),
  );
});

test('system news cards remain exempt from engagement decay', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const systemNews = {
    ...createNewsItem('news-system', '2026-06-01T12:00:00.000Z', 20),
    isSystemCard: true,
  };

  assert.equal(getHomeContentEngagementScore(systemNews, now), 20);
});

test('FeedItemRenderer keeps kind news on the NewsCard path', () => {
  const rendererSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/feed/FeedItemRenderer.tsx'),
    'utf8',
  );

  assert.match(rendererSource, /case 'news':[\s\S]*?<NewsCard/);
});
