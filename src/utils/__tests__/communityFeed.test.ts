/**
 * Tests for community feed routing architecture.
 *
 * Covers:
 * - PostComposer insert payload: feed_targets, actor_type, actor_id
 * - community_id is only set for community-actor posts
 * - feed_targets routing: which posts appear in community vs Home feeds
 * - Author hydration: posts have display names, not "Fan" placeholder
 * - Single active video: isActiveVideo flag logic
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Post } from '../../types/post';
import { buildCommunityFeedTargetFilter } from '../communityFeedTargets';
import { buildPostInsertPayload, shouldSyncPostToHome } from '../postComposerPayload';
import { selectActiveInlineVideoKey } from '../videoPlaybackBehavior';

// Inlined from src/utils/homeFeed.ts — avoids pulling in React Native deps
function isHomePost(post: Pick<Post, 'feedTargets'>): boolean {
  const feedTargets = Array.isArray(post.feedTargets) ? post.feedTargets : [];
  return feedTargets.includes('home') || feedTargets.length === 0;
}

// ---------------------------------------------------------------------------
// Helper: build a minimal Post object
// ---------------------------------------------------------------------------
function makePost(overrides: Partial<Post> & { feedTargets: string[] }): Post {
  return {
    id: overrides.id ?? 'post-1',
    postType: overrides.postType ?? 'post',
    authorName: overrides.authorName ?? 'Fan',
    authorId: overrides.authorId ?? 'user-1',
    feedTargets: overrides.feedTargets,
    communityId: overrides.communityId ?? null,
    actorType: overrides.actorType ?? 'user',
    actorId: overrides.actorId ?? overrides.authorId ?? 'user-1',
    createdAt: overrides.createdAt ?? '2026-06-11T10:00:00.000Z',
    text: overrides.text ?? 'Test post',
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
    media: [],
  };
}

// ---------------------------------------------------------------------------
// PostComposer insert payload logic (pure)
// These tests mirror the logic in PostComposer.handlePublish to verify the
// correct fields are derived before being sent to Supabase.
// ---------------------------------------------------------------------------

test('PostComposer: user post with no feedTargets defaults to home', () => {
  const payload = buildPostInsertPayload('user-1', 'Hello', undefined, undefined);

  assert.deepEqual(payload.feed_targets, ['home']);
  assert.deepEqual(payload.media, []);
  assert.equal('media_type' in payload, false);
  assert.equal(payload.actor_type, 'user');
  assert.equal(payload.actor_id, 'user-1');
  assert.equal(payload.author_id, 'user-1');
  assert.equal('community_id' in payload, false, 'community_id must not be set for user posts');
});

test('PostComposer: user post with explicit community feed target', () => {
  const communityId = 'comm-abc';
  const payload = buildPostInsertPayload(
    'user-1',
    'Community post',
    { type: 'user', id: 'user-1' },
    [`community:${communityId}`],
  );

  assert.deepEqual(payload.feed_targets, [`community:${communityId}`]);
  assert.equal(payload.actor_type, 'user');
  assert.equal(payload.actor_id, 'user-1');
  assert.equal(
    'community_id' in payload,
    false,
    'community_id must not be set for user-actor posts',
  );
});

test('PostComposer: user post targeting community AND home', () => {
  const communityId = 'comm-abc';
  const payload = buildPostInsertPayload('user-1', 'Both feeds', { type: 'user', id: 'user-1' }, [
    'home',
    `community:${communityId}`,
  ]);

  assert.ok((payload.feed_targets as string[]).includes('home'), 'feed_targets must include home');
  assert.ok(
    (payload.feed_targets as string[]).includes(`community:${communityId}`),
    'feed_targets must include community target',
  );
  assert.equal(
    'community_id' in payload,
    false,
    'community_id must not be set for user-actor posts',
  );
});

test('PostComposer: community-actor post sets community_id and actor fields correctly', () => {
  const communityId = 'comm-xyz';
  const payload = buildPostInsertPayload(
    'user-1',
    'Community announcement',
    { type: 'community', id: communityId },
    [`community:${communityId}`],
  );

  assert.equal(payload.actor_type, 'community');
  assert.equal(payload.actor_id, communityId);
  assert.equal(
    payload.community_id,
    communityId,
    'community_id must be set for community-actor posts',
  );
  assert.deepEqual(payload.feed_targets, [`community:${communityId}`]);
});

test('PostComposer: community identity without explicit targets still defaults routing to Home', () => {
  const payload = buildPostInsertPayload(
    'user-1',
    'Community voice, Home route',
    { type: 'community', id: 'comm-xyz' },
    undefined,
  );

  assert.deepEqual(payload.feed_targets, ['home']);
  assert.equal(payload.actor_type, 'community');
  assert.equal(payload.actor_id, 'comm-xyz');
  assert.equal(payload.community_id, 'comm-xyz');
});

test('PostComposer: multi-community post has all targets in feed_targets', () => {
  const payload = buildPostInsertPayload(
    'user-1',
    'Multi-community',
    { type: 'user', id: 'user-1' },
    ['community:comm-1', 'community:comm-2'],
  );

  assert.deepEqual(payload.feed_targets, ['community:comm-1', 'community:comm-2']);
  assert.equal('community_id' in payload, false);
});

test('PostComposer: media_type is only set when media exists', () => {
  const payload = buildPostInsertPayload(
    'user-1',
    'Video',
    { type: 'user', id: 'user-1' },
    ['home'],
    {
      media: [
        {
          bucket: 'post-media',
          path: 'user-1/video.mp4',
          type: 'video',
          mimeType: 'video/mp4',
          duration: 12000,
        },
      ],
    },
  );

  assert.equal(payload.media_type, 'video');
  assert.equal(payload.media[0]?.mimeType, 'video/mp4');
  assert.equal(payload.media[0]?.duration, 12000);
});

test('PostComposer: link_preview is only persisted when a preview exists', () => {
  const withoutPreview = buildPostInsertPayload('user-1', 'No link', undefined, ['home']);
  const withPreview = buildPostInsertPayload('user-1', 'Read https://fcn.dk', undefined, ['home'], {
    linkPreview: {
      url: 'https://fcn.dk/',
      title: 'FC Nordsjælland',
    },
  });

  assert.equal('link_preview' in withoutPreview, false);
  assert.deepEqual(withPreview.link_preview, {
    url: 'https://fcn.dk/',
    title: 'FC Nordsjælland',
  });
});

test('PostComposer: only Home-targeted posts sync into global Home state', () => {
  assert.equal(shouldSyncPostToHome(['home']), true);
  assert.equal(shouldSyncPostToHome(['home', 'community:comm-1']), true);
  assert.equal(shouldSyncPostToHome(['community:comm-1']), false);
});

// ---------------------------------------------------------------------------
// Community feed query filtering (mimics Supabase .contains('feed_targets', [...]))
// ---------------------------------------------------------------------------

test('Community feed query: JSONB containment operand is serialized as JSON', () => {
  assert.equal(buildCommunityFeedTargetFilter('comm-1'), '["community:comm-1"]');
});

function postIsInCommunityFeed(post: Post, communityId: string): boolean {
  const feedTargets = Array.isArray(post.feedTargets) ? post.feedTargets : [];
  return feedTargets.includes(`community:${communityId}`);
}

test('Community feed query: community-targeted post appears in its community feed', () => {
  const post = makePost({ feedTargets: ['community:comm-1'] });
  assert.equal(postIsInCommunityFeed(post, 'comm-1'), true);
});

test('Community feed query: home-only post does NOT appear in community feed', () => {
  const post = makePost({ feedTargets: ['home'] });
  assert.equal(postIsInCommunityFeed(post, 'comm-1'), false);
});

test('Community feed query: community + home post appears in both', () => {
  const post = makePost({ feedTargets: ['home', 'community:comm-1'] });
  assert.equal(postIsInCommunityFeed(post, 'comm-1'), true);
  assert.equal(isHomePost(post), true);
});

test('Community feed query: multi-community post appears in each targeted community', () => {
  const post = makePost({ feedTargets: ['community:comm-1', 'community:comm-2'] });
  assert.equal(postIsInCommunityFeed(post, 'comm-1'), true);
  assert.equal(postIsInCommunityFeed(post, 'comm-2'), true);
  assert.equal(postIsInCommunityFeed(post, 'comm-3'), false);
});

test('Community feed query: community-only post does NOT appear in Home', () => {
  const post = makePost({ feedTargets: ['community:comm-1'] });
  assert.equal(postIsInCommunityFeed(post, 'comm-1'), true);
  assert.equal(isHomePost(post), false, 'community-only post must not appear in Home');
});

// ---------------------------------------------------------------------------
// Author hydration
// ---------------------------------------------------------------------------

function hydratePostAuthor(
  post: Post,
  profileMap: Record<string, { display_name: string | null; avatar_url: string | null }>,
): Post {
  const profile = profileMap[post.authorId ?? ''] ?? null;
  return {
    ...post,
    authorName: profile?.display_name ?? post.authorName,
    authorDisplayName: profile?.display_name ?? null,
    authorAvatarUrl: profile?.avatar_url ?? null,
  };
}

test('Author hydration: display_name replaces "Fan" placeholder when profile exists', () => {
  const post = makePost({
    feedTargets: ['community:comm-1'],
    authorId: 'user-1',
    authorName: 'Fan',
  });
  const profiles = { 'user-1': { display_name: 'Rasmus Jakobsen', avatar_url: null } };
  const hydrated = hydratePostAuthor(post, profiles);

  assert.equal(hydrated.authorName, 'Rasmus Jakobsen');
  assert.equal(hydrated.authorDisplayName, 'Rasmus Jakobsen');
});

test('Author hydration: "Fan" is kept when profile is not in map', () => {
  const post = makePost({
    feedTargets: ['community:comm-1'],
    authorId: 'user-99',
    authorName: 'Fan',
  });
  const profiles = {};
  const hydrated = hydratePostAuthor(post, profiles);

  assert.equal(hydrated.authorName, 'Fan');
});

test('Author hydration: null display_name does not override existing author name', () => {
  const post = makePost({
    feedTargets: ['community:comm-1'],
    authorId: 'user-1',
    authorName: 'Existing Name',
  });
  const profiles = { 'user-1': { display_name: null, avatar_url: null } };
  const hydrated = hydratePostAuthor(post, profiles);

  // null display_name falls back to existing authorName
  assert.equal(hydrated.authorName, 'Existing Name');
});

// ---------------------------------------------------------------------------
// Video autoplay: isActiveVideo logic (single active video at a time)
// ---------------------------------------------------------------------------

test('Video autoplay: fully visible card is active', () => {
  const layouts = { 'post:video-1': { y: 0, height: 400 } };
  const activeKey = selectActiveInlineVideoKey(layouts, 0, 800);
  assert.equal(activeKey, 'post:video-1');
});

test('Video autoplay: card that is less than 60% visible is not active', () => {
  // card at y=700, height=400. viewport=800. visible = 800-700 = 100 of 400 → 25%
  const layouts = { 'post:video-1': { y: 700, height: 400 } };
  const activeKey = selectActiveInlineVideoKey(layouts, 0, 800);
  assert.equal(activeKey, null);
});

test('Video autoplay: only the first sufficiently visible card is active', () => {
  // card1 at y=0, height=500. viewport=800. fully visible → 100%
  // card2 at y=550, height=400. visible = 800-550=250 of 400 → 62.5%
  const layouts = {
    'post:card-1': { y: 0, height: 500 },
    'post:card-2': { y: 550, height: 400 },
  };
  const activeKey = selectActiveInlineVideoKey(layouts, 0, 800);
  assert.equal(activeKey, 'post:card-1', 'first card is more visible so it wins');
});

test('Video autoplay: active card changes as user scrolls', () => {
  const layouts = {
    'post:card-1': { y: 0, height: 600 },
    'post:card-2': { y: 650, height: 600 },
  };
  const viewport = 800;

  // At scroll 0: card-1 fully visible (100%), card-2 barely visible
  assert.equal(selectActiveInlineVideoKey(layouts, 0, viewport), 'post:card-1');

  // At scroll 600: card-1 scrolled off, card-2 starts entering
  // card-2 visible = (650+600-600)=650, visibleBottom = min(650, 800)=800, visibleTop=max(650-600,0)=50 → wait
  // card-2: cardTop = 650-600=50, cardBottom=50+600=650, visibleTop=50, visibleBottom=650, visible=600 of 600 → 100%
  assert.equal(selectActiveInlineVideoKey(layouts, 600, viewport), 'post:card-2');
});

test('Video autoplay: no active card when no card meets threshold', () => {
  // All cards are off-screen
  const layouts = {
    'post:card-1': { y: 900, height: 400 },
  };
  assert.equal(selectActiveInlineVideoKey(layouts, 0, 800), null);
});
