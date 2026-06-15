import assert from 'node:assert/strict';
import test from 'node:test';
import type { Post } from '../../types/post';
import { mergeCommunityFeedProfiles } from '../communityFeedProfiles';
import {
  resolveFanPostBadgeCandidate,
  resolveFeedItemAuthorProfile,
  type FanPostBadgeAuthorProfile,
} from '../fanPostBadge';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    postType: 'post',
    authorName: 'Fan',
    authorId: 'user-1',
    actorType: 'user',
    actorId: 'user-1',
    createdAt: '2026-06-15T08:00:00.000Z',
    text: 'Test post',
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
    media: [],
    ...overrides,
  };
}

test('user post with valid author profile fan level resolves a badge', () => {
  const post = makePost();
  const level = resolveFanPostBadgeCandidate({
    postType: post.postType,
    actorType: post.actorType,
    authorProfile: { fan_level_key: 'regular_voice' },
    postAuthorFanLevelKey: post.authorFanLevelKey,
  });

  assert.equal(level, 'regular_voice');
});

test('invalid or missing author profile fan level resolves no badge', () => {
  const post = makePost({ authorFanLevelKey: 'top_fan' });

  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: { fan_level_key: null },
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    null,
  );
  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: { fan_level_key: 'invalid_level' as any },
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    null,
  );
});

test('media article resolves no fan badge', () => {
  const post = makePost({ postType: 'media_article', authorFanLevelKey: 'top_fan' });

  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: { fan_level_key: 'top_fan' },
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    null,
  );
});

test('community actor post resolves no fan badge', () => {
  const post = makePost({
    actorType: 'community',
    actorId: 'community-1',
    communityId: 'community-1',
    authorFanLevelKey: 'top_fan',
  });

  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: { fan_level_key: 'top_fan' },
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    null,
  );
});

test('post author fan level fallback is used only when author profile is missing', () => {
  const post = makePost({ authorFanLevelKey: 'community_core' });
  const missingProfile = resolveFeedItemAuthorProfile(post.authorId, {});

  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: missingProfile,
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    'community_core',
  );
  assert.equal(
    resolveFanPostBadgeCandidate({
      postType: post.postType,
      actorType: post.actorType,
      authorProfile: { fan_level_key: null },
      postAuthorFanLevelKey: post.authorFanLevelKey,
    }),
    null,
  );
});

test('CommunityDetail local profile hydration reaches feed author badge resolution', () => {
  const post = makePost({ feedTargets: ['community:community-1'] });
  const globalProfiles: Record<string, FanPostBadgeAuthorProfile> = {
    'user-2': {
      display_name: 'Other Fan',
      avatar_url: null,
      fan_level_key: 'new_fan' as const,
    },
  };
  const localProfiles: Record<string, FanPostBadgeAuthorProfile> = {
    'user-1': {
      display_name: 'Community Fan',
      avatar_url: 'avatar.jpg',
      fan_level_key: 'dedicated' as const,
    },
  };
  const mergedProfiles = mergeCommunityFeedProfiles(globalProfiles, localProfiles);
  const authorProfile = resolveFeedItemAuthorProfile(post.authorId, mergedProfiles);
  const level = resolveFanPostBadgeCandidate({
    postType: post.postType,
    actorType: post.actorType,
    authorProfile,
    postAuthorFanLevelKey: post.authorFanLevelKey,
  });

  assert.equal(authorProfile?.display_name, 'Community Fan');
  assert.equal(level, 'dedicated');
});
