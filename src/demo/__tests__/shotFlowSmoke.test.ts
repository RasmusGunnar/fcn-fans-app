import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_COMMUNITIES, DEMO_COMMUNITY_IDS } from '../communities';
import { DEMO_DISCUSSION_POSTS, DEMO_DISCUSSION_THREADS } from '../discussions';
import { createDemoFeedSnapshot } from '../feed';
import {
  addDemoComment,
  getDemoComments,
  getDemoLikeState,
  getDemoParticipation,
  getDemoPollVotes,
  resetDemoInteractions,
  setDemoCheckedIn,
  setDemoRsvp,
  toggleDemoLike,
  voteInDemoPoll,
} from '../interactions';
import { DEMO_FAN_ACTIVITIES, DEMO_PRIMARY_FIXTURE } from '../matches';
import { DEMO_MEDIA_FILES } from '../media';
import { DEMO_COMMENTS, DEMO_POSTS, getDemoPostsForCommunity } from '../posts';
import { DEMO_CURRENT_USER, DEMO_PROFILE_MAP, DEMO_USERS } from '../users';

test('shot 1: Home feed is populated, ordered and fully hydrated', () => {
  const snapshot = createDemoFeedSnapshot();

  assert.equal(snapshot.posts.length, 20);
  assert.equal(snapshot.homeFeedItems.length, 25);
  assert.ok(Object.keys(snapshot.likeMap).length >= 20);
  assert.ok(Object.keys(snapshot.commentCountMap).length >= 20);

  for (const post of snapshot.posts) {
    assert.ok(post.authorId && DEMO_PROFILE_MAP[post.authorId]);
    assert.ok(post.authorName.trim());
    assert.ok(Number.isFinite(post.likesCount));
    assert.ok(Number.isFinite(post.commentsCount));
  }

  for (let index = 1; index < snapshot.posts.length; index += 1) {
    assert.ok(
      Date.parse(snapshot.posts[index - 1].createdAt) >=
        Date.parse(snapshot.posts[index].createdAt),
    );
  }
});

test('shots 2-4: Communities contain the required names and coordination content', () => {
  const requiredCommunities = [
    ['Ganløse Fans', 37],
    ['Farum Fans', 126],
    ['Udebaneture', 142],
    ['Tifo & Stemning', 84],
  ] as const;

  for (const [name, members] of requiredCommunities) {
    const community = DEMO_COMMUNITIES.find((item) => item.name === name);
    assert.ok(community, `${name} is missing`);
    assert.equal(community.member_count, members);
    assert.ok(community.description && community.description.length > 25);
  }

  assert.equal(DEMO_COMMUNITIES.filter((item) => item.type === 'fan_faction').length, 2);

  const ganlosePosts = getDemoPostsForCommunity(DEMO_COMMUNITY_IDS.ganlose);
  assert.ok(ganlosePosts.some((post) => /kører fra Ganløse|øl ved stadion/i.test(post.text)));
  assert.ok(getDemoComments('post', 'demo-post-03').length >= 3);

  const awayPosts = getDemoPostsForCommunity(DEMO_COMMUNITY_IDS.away);
  const awayCopy = awayPosts.map((post) => post.text).join(' ');
  assert.match(awayCopy, /toget/i);
  assert.match(awayCopy, /warm-up/i);
  assert.match(awayCopy, /banner/i);
  assert.match(awayCopy, /hjemtransport/i);

  const awayComments = getDemoComments('post', 'demo-post-02')
    .map((comment) => comment.text)
    .join(' ');
  assert.match(awayComments, /10\.23|Høje Taastrup/i);
  assert.match(awayComments, /mødes|pub/i);
  assert.match(awayComments, /pladser i bilen/i);
});

test('shots 5-6: Match and all five fan-media moments are present', () => {
  assert.equal(DEMO_PRIMARY_FIXTURE.home_team, 'FC Nordsjælland');
  assert.equal(DEMO_PRIMARY_FIXTURE.away_team, 'Viborg FF');
  assert.ok(DEMO_FAN_ACTIVITIES.length >= 2);
  assert.ok(
    DEMO_FAN_ACTIVITIES.every((activity) => activity.parent_id === DEMO_PRIMARY_FIXTURE.id),
  );

  const mediaUrls = new Set(
    DEMO_POSTS.flatMap((post) => post.media ?? []).map((media) => media.url),
  );
  for (const file of Object.values(DEMO_MEDIA_FILES)) {
    assert.ok(mediaUrls.has(`demo://${file}`), `${file} is not used by a post`);
  }

  const visibleCopy = DEMO_POSTS.map((post) => post.text).join(' ');
  assert.match(visibleCopy, /warm-up/i);
  assert.match(visibleCopy, /Næste stop: udebanen/i);
  assert.match(visibleCopy, /tribunen/i);
  assert.match(visibleCopy, /sommerhus i Rørvig/i);
  assert.match(visibleCopy, /Tre point med hjem/i);
});

test('shot 7: Like, comment, reply, poll, RSVP and check-in stay in local state', () => {
  resetDemoInteractions();

  const beforeLike = getDemoLikeState('post', 'demo-post-03');
  const afterLike = toggleDemoLike('post', 'demo-post-03');
  assert.equal(afterLike.liked, !beforeLike.liked);
  assert.equal(afterLike.likes, beforeLike.likes + (beforeLike.liked ? -1 : 1));

  const comment = addDemoComment({
    targetType: 'post',
    targetId: 'demo-post-03',
    authorId: DEMO_CURRENT_USER.id,
    text: 'Vi ses ved stadion.',
  });
  const reply = addDemoComment({
    targetType: 'post',
    targetId: 'demo-post-03',
    authorId: DEMO_CURRENT_USER.id,
    parentId: comment.id,
    text: 'Perfekt, jeg skriver lige.',
  });
  assert.equal(reply.parent_id, comment.id);
  assert.ok(getDemoComments('post', 'demo-post-03').some((item) => item.id === reply.id));

  const pollBefore = getDemoPollVotes(['demo-post-06'])['demo-post-06'];
  const totalBefore = Object.values(pollBefore.optionVotes).reduce((sum, votes) => sum + votes, 0);
  assert.equal(voteInDemoPoll('demo-post-06', 'poll-points-9'), true);
  const pollAfter = getDemoPollVotes(['demo-post-06'])['demo-post-06'];
  const totalAfter = Object.values(pollAfter.optionVotes).reduce((sum, votes) => sum + votes, 0);
  assert.equal(totalAfter, totalBefore + 1);
  assert.ok(pollAfter.voters['poll-points-9'].includes(DEMO_CURRENT_USER.id));

  setDemoRsvp('not_going');
  setDemoCheckedIn(true);
  assert.deepEqual(getDemoParticipation(), { isGoing: false, isCheckedIn: true });
  setDemoRsvp('going');
  assert.deepEqual(getDemoParticipation(), { isGoing: true, isCheckedIn: true });
});

test('shot 8: Debate is active and visually safe strings contain no fixture leakage', () => {
  assert.equal(DEMO_DISCUSSION_THREADS.length, 6);
  assert.ok(DEMO_DISCUSSION_THREADS.some((thread) => thread.replyCount >= 31));
  assert.ok(Object.values(DEMO_DISCUSSION_POSTS).some((posts) => posts.length >= 3));

  const visibleStrings = [
    ...DEMO_USERS.map((user) => user.displayName),
    ...DEMO_COMMUNITIES.flatMap((community) => [community.name, community.description ?? '']),
    ...DEMO_POSTS.flatMap((post) => [post.authorName, post.text, post.poll_data?.question ?? '']),
    ...DEMO_COMMENTS.map((comment) => `${comment.author_display_name} ${comment.text}`),
    ...DEMO_DISCUSSION_THREADS.flatMap((thread) => [thread.title, thread.description]),
  ];

  for (const value of visibleStrings) {
    const rendered = String(value ?? '');
    assert.doesNotMatch(rendered, /\[object Object\]|Lorem ipsum|Test User|foo@bar\.com/i);
    assert.doesNotMatch(
      rendered,
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
  }

  const commentIds = new Set(DEMO_COMMENTS.map((comment) => comment.id));
  for (const comment of DEMO_COMMENTS) {
    assert.ok(!comment.parent_id || commentIds.has(comment.parent_id));
    assert.ok(DEMO_PROFILE_MAP[comment.author_id]);
  }
});
