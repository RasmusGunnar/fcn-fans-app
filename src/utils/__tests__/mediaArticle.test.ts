import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getFeedItemKey } from '../../types/feed';
import { assertValidPostSubtypePayload, normalizePostType, type Post } from '../../types/post';
import { getPostEngagementIdentity, POST_ENGAGEMENT_TARGET_TYPE } from '../postEngagement';
import { toPostFeedItem } from '../postFeedItem';
import {
  buildMediaArticleInsertPayload,
  normalizeMediaArticleUrl,
} from '../mediaArticle';
import {
  MEDIA_ARTICLE_AVATAR_MODE,
  MEDIA_ARTICLE_EAGER_REMOTE_ASSET_COUNT,
  getMediaArticleHeaderPresentation,
  getMediaArticleSourceName,
  getMediaArticleSourceInitials,
} from '../mediaArticlePresentation';

function createMediaArticle(): Post {
  return {
    id: 'article-1',
    postType: 'media_article',
    authorName: 'FCN Media',
    createdAt: '2026-06-09T10:00:00.000Z',
    text: 'Article caption',
    linkPreview: {
      url: 'https://example.com/article',
      title: 'Article title',
      description: 'Article description',
      siteName: 'Example',
    },
    likesCount: 2,
    commentsCount: 3,
    likedByMe: false,
  };
}

test('media_article maps to FeedItem.kind post', () => {
  const item = toPostFeedItem(createMediaArticle());

  assert.equal(item.kind, 'post');
  assert.equal(item.data.postType, 'media_article');
});

test('media_article engagement identity remains post:<id>', () => {
  const item = toPostFeedItem(createMediaArticle());
  const identity = getPostEngagementIdentity(item.id);

  assert.equal(getFeedItemKey(item), 'post:article-1');
  assert.equal(identity.key, 'post:article-1');
});

test('post likes and comments keep targetType post', () => {
  const identity = getPostEngagementIdentity('article-1');

  assert.equal(POST_ENGAGEMENT_TARGET_TYPE, 'post');
  assert.equal(identity.targetType, 'post');
});

test('legacy posts default to post', () => {
  assert.equal(normalizePostType(undefined), 'post');
  assert.equal(normalizePostType(null), 'post');
  assert.equal(normalizePostType('post'), 'post');
});

test('media_article without a valid link_preview.url is rejected', () => {
  assert.throws(
    () => assertValidPostSubtypePayload('media_article', null),
    /valid HTTP\(S\) link_preview\.url/,
  );
  assert.throws(
    () => assertValidPostSubtypePayload('media_article', { url: 'not-a-url' }),
    /valid HTTP\(S\) link_preview\.url/,
  );
  assert.doesNotThrow(() =>
    assertValidPostSubtypePayload('media_article', {
      url: 'https://example.com/article',
    }),
  );
});

test('media_article creation payload is a normal Home post with optional preview metadata', () => {
  const payload = buildMediaArticleInsertPayload({
    authorId: 'admin-1',
    url: 'https://example.com/article#comments',
    caption: '  Kort intro  ',
    preview: {
      title: 'Article title',
      description: 'Article description',
      imageUrl: 'https://example.com/cover.jpg',
      siteName: 'Example',
    },
  });

  assert.equal(payload.post_type, 'media_article');
  assert.equal(payload.author_id, 'admin-1');
  assert.equal(payload.actor_type, 'user');
  assert.equal(payload.actor_id, 'admin-1');
  assert.equal(payload.text, 'Kort intro');
  assert.deepEqual(payload.feed_targets, ['home']);
  assert.equal(payload.link_preview.url, 'https://example.com/article');
  assert.equal(payload.link_preview.title, 'Article title');
  assert.equal(payload.link_preview.imageUrl, 'https://example.com/cover.jpg');
});

test('media_article creation rejects invalid URLs and normalizes fragments for duplicate checks', () => {
  assert.equal(
    normalizeMediaArticleUrl('https://example.com/article#comments'),
    'https://example.com/article',
  );
  assert.throws(
    () =>
      buildMediaArticleInsertPayload({
        authorId: 'admin-1',
        url: 'javascript:alert(1)',
      }),
    /valid HTTP\(S\) URL/,
  );
});

test('media_article presentation uses publisher identity in a normal post header', () => {
  const presentation = getMediaArticleHeaderPresentation('media_article', {
    url: 'https://bold.dk/fodbold/nyheder/article',
    siteName: 'Bold.dk',
  });

  assert.equal(presentation?.sourceName, 'Bold.dk');
  assert.equal(presentation?.secondaryLabel, 'FCN i medierne');
  assert.equal(presentation?.initials, 'B');
  assert.match(presentation?.avatarUrl ?? '', /google\.com\/s2\/favicons/);
  assert.equal(presentation?.avatarMode, MEDIA_ARTICLE_AVATAR_MODE);
  assert.equal(presentation?.eagerRemoteAssetCount, 0);
  assert.equal(presentation?.accessibilityLabel, 'Bold.dk \u00b7 FCN i medierne');
});

test('media_article source is derived and formatted from URL when metadata is missing', () => {
  assert.equal(
    getMediaArticleSourceName({
      url: 'https://www.tipsbladet.dk/nyhed/superliga/article',
    }),
    'Tipsbladet',
  );
  assert.equal(
    getMediaArticleSourceName({
      url: 'https://sport.tv2.dk/fodbold/article',
    }),
    'TV 2',
  );
});

test('media_article source metadata follows siteName, sourceName, then provider priority', () => {
  assert.equal(
    getMediaArticleSourceName({
      url: 'https://campo.dk/article',
      siteName: 'Tipsbladet.dk',
      sourceName: 'Campo',
      provider: 'Bold.dk',
    }),
    'Tipsbladet',
  );
  assert.equal(
    getMediaArticleSourceName({
      url: 'https://example.com/article',
      sourceName: 'FCN.dk',
      provider: 'Bold.dk',
    }),
    'FCN.dk',
  );
  assert.equal(
    getMediaArticleSourceName({
      url: 'https://example.com/article',
      provider: 'Campo',
    }),
    'Campo',
  );
});

test('media_article avatar preparation is synchronous and performs no eager remote work', () => {
  const presentation = getMediaArticleHeaderPresentation('media_article', {
    url: 'https://tipsbladet.dk/article',
    faviconUrl: 'https://cdn.tipsbladet.dk/favicon.png',
    sourceLogoUrl: 'https://cdn.tipsbladet.dk/logo.png',
  });

  assert.equal(MEDIA_ARTICLE_AVATAR_MODE, 'lazy-image');
  assert.equal(MEDIA_ARTICLE_EAGER_REMOTE_ASSET_COUNT, 0);
  assert.equal(presentation?.avatarMode, 'lazy-image');
  assert.equal(
    presentation?.avatarUrl,
    'https://cdn.tipsbladet.dk/favicon.png',
  );
  assert.equal(presentation?.eagerRemoteAssetCount, 0);
  assert.equal(presentation?.initials, 'T');
  assert.equal(getMediaArticleSourceInitials('FCN.dk'), 'FCN');
  assert.equal(getMediaArticleSourceInitials('TV 2'), 'TV2');
  assert.equal(getMediaArticleSourceInitials('Ekstern kilde'), 'EK');
});

test('normal fan posts do not receive a media_article badge', () => {
  assert.equal(
    getMediaArticleHeaderPresentation('post', {
      url: 'https://bold.dk/fodbold/nyheder/article',
    }),
    null,
  );
});

test('FanPostCard renders post body only when trimmed text exists', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/cards/FanPostCard.tsx'),
    'utf8',
  );

  assert.match(source, /const bodyText = post\.text\?\.trim\(\) \?\? '';/);
  assert.match(source, /\) : bodyText\.length > 0 \? \(/);
  assert.match(
    source,
    /<Text\s+variant="body"\s+color="primary"\s+style=\{styles\.bodyText\}[\s\S]*?>\s*\{renderBodyTextSegments\(\)\}\s*<\/Text>/,
  );
  assert.match(
    source,
    /const renderBodyTextSegments = useCallback\([\s\S]*?bodySegments\.map\(\(segment, index\) =>[\s\S]*?segment\.type === 'url'/,
  );
  assert.match(
    source,
    /bodyTextContainer:\s*\{[\s\S]*?marginBottom: theme\.spacing\[3\]/,
  );
});
