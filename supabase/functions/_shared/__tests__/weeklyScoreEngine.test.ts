import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AWAY_CHECKIN_SCORE,
  buildCopenhagenWeekWindow,
  calculateWeeklyShadowScore,
  HOME_CHECKIN_SCORE,
  type WeeklyScoreInput,
  type WeeklyScorePostRow,
  type WeeklyScoreProfileRow,
} from '../weeklyScoreEngine.js';

const WEEK = buildCopenhagenWeekWindow('2026-06-22');
const BASE_INPUT: WeeklyScoreInput = {
  ...WEEK,
  profiles: [],
  appAdminUserIds: [],
  recentWinnerUserIds: [],
  posts: [],
  comments: [],
  likes: [],
  pollVotes: [],
  rsvps: [],
  matchCheckins: [],
  fixtures: [],
  fanActivityRegistrations: [],
  busTripSignals: [],
  mediaArticleCandidates: [],
  includeDetails: true,
};

function profile(id: string): WeeklyScoreProfileRow {
  return { id, display_name: id };
}

function post(
  id: string,
  authorId: string,
  overrides: Partial<WeeklyScorePostRow> = {},
): WeeklyScorePostRow {
  return {
    id,
    author_id: authorId,
    actor_type: 'user',
    actor_id: authorId,
    post_type: 'post',
    created_at: '2026-06-22T10:00:00.000Z',
    ...overrides,
  };
}

function scoreFor(userId: string, input: Partial<WeeklyScoreInput>): number {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    ...input,
    profiles: input.profiles ?? [profile(userId)],
  });
  return output.users.find((user) => user.userId === userId)?.total ?? 0;
}

test('personal posts and polls share the daily post cap', () => {
  assert.equal(
    scoreFor('user-1', {
      posts: [
        post('post-1', 'user-1', { created_at: '2026-06-22T08:00:00.000Z' }),
        post('poll-1', 'user-1', {
          created_at: '2026-06-22T09:00:00.000Z',
          poll_data: { question: 'Kampens spiller?' },
        }),
        post('post-2', 'user-1', { created_at: '2026-06-22T10:00:00.000Z' }),
      ],
    }),
    16,
  );
});

test('media_article scores only when personal non-admin provenance is safe', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('user-1'), profile('user-2'), profile('admin-1')],
    appAdminUserIds: ['admin-1'],
    posts: [
      post('article-safe', 'user-1', {
        post_type: 'media_article',
        actor_type: 'user',
        actor_id: 'user-1',
      }),
      post('article-uncertain', 'user-2', {
        post_type: 'media_article',
        actor_type: 'user',
        actor_id: null,
      }),
      post('article-admin', 'admin-1', {
        post_type: 'media_article',
        actor_type: 'user',
        actor_id: 'admin-1',
      }),
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'user-1')?.total, 8);
  assert.equal(output.users.find((user) => user.userId === 'user-2')?.total, 0);
  assert.equal(output.users.find((user) => user.userId === 'admin-1')?.total, 0);
  assert.equal(output.mediaArticleProvenanceUncertain.length, 1);
  assert.equal(output.mediaArticleProvenanceUncertain[0].sourceId, 'article-uncertain');
});

test('comments and replies share daily and target caps, while replies stay distinct', () => {
  const comments = [
    {
      id: 'comment-1',
      author_id: 'user-1',
      target_type: 'post',
      target_id: 'post-1',
      created_at: '2026-06-22T08:00:00.000Z',
      parent_id: null,
    },
    {
      id: 'reply-1',
      author_id: 'user-1',
      target_type: 'post',
      target_id: 'post-1',
      created_at: '2026-06-22T09:00:00.000Z',
      parent_id: 'comment-1',
    },
    {
      id: 'reply-2',
      author_id: 'user-1',
      target_type: 'post',
      target_id: 'post-1',
      created_at: '2026-06-22T10:00:00.000Z',
      parent_id: 'comment-1',
    },
    {
      id: 'reply-3-capped',
      author_id: 'user-1',
      target_type: 'post',
      target_id: 'post-1',
      created_at: '2026-06-22T11:00:00.000Z',
      parent_id: 'comment-1',
    },
  ];
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('user-1')],
    comments,
  });

  assert.equal(output.users.find((user) => user.userId === 'user-1')?.total, 6);
  assert.equal(output.events.find((event) => event.sourceId === 'reply-1')?.activityType, 'reply');
  assert.equal(
    output.events.find((event) => event.sourceId === 'reply-3-capped')?.reason,
    'comment_reply_target_24h_cap',
  );
});

test('likes given exclude self-likes and apply the daily cap', () => {
  const posts = [
    post('own-post', 'user-1', { created_at: '2026-06-15T10:00:00.000Z' }),
    ...Array.from({ length: 6 }, (_, index) => post(`post-${index}`, `author-${index}`)),
  ];
  const likes = [
    {
      id: 'self-like',
      user_id: 'user-1',
      target_type: 'post',
      target_id: 'own-post',
      created_at: '2026-06-22T08:00:00.000Z',
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `like-${index}`,
      user_id: 'user-1',
      target_type: 'post',
      target_id: `post-${index}`,
      created_at: `2026-06-22T1${index}:00:00.000Z`,
    })),
  ];

  assert.equal(
    scoreFor('user-1', {
      profiles: [
        profile('user-1'),
        ...Array.from({ length: 6 }, (_, index) => profile(`author-${index}`)),
      ],
      posts,
      likes,
    }),
    5,
  );
});

test('likes received keep existing per-post cap', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [
      profile('author-1'),
      ...Array.from({ length: 6 }, (_, index) => profile(`liker-${index}`)),
    ],
    posts: [post('post-1', 'author-1')],
    likes: Array.from({ length: 6 }, (_, index) => ({
      id: `like-${index}`,
      user_id: `liker-${index}`,
      target_type: 'post',
      target_id: 'post-1',
      created_at: `2026-06-22T1${index}:00:00.000Z`,
    })),
  });

  assert.equal(
    output.users.find((user) => user.userId === 'author-1')?.pointsByActivityType
      .like_received_post,
    5,
  );
});

test('poll votes score once, exclude own poll votes, and cap per day', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('poll-author'), profile('voter-1')],
    pollVotes: [
      {
        id: 'own-vote',
        post_id: 'poll-1',
        option_id: 'a',
        user_id: 'poll-author',
        created_at: '2026-06-22T08:00:00.000Z',
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `vote-${index}`,
        post_id: `poll-${index + 1}`,
        option_id: 'a',
        user_id: 'voter-1',
        created_at: `2026-06-22T1${index}:00:00.000Z`,
      })),
    ],
    posts: [
      post('poll-1', 'poll-author', {
        created_at: '2026-06-15T10:00:00.000Z',
        poll_data: { question: 'Hvem scorer?' },
      }),
      post('poll-2', 'poll-author', {
        created_at: '2026-06-15T10:00:00.000Z',
        poll_data: { question: 'Hvem scorer?' },
      }),
      post('poll-3', 'poll-author', {
        created_at: '2026-06-15T10:00:00.000Z',
        poll_data: { question: 'Hvem scorer?' },
      }),
      post('poll-4', 'poll-author', {
        created_at: '2026-06-15T10:00:00.000Z',
        poll_data: { question: 'Hvem scorer?' },
      }),
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'poll-author')?.total, 0);
  assert.equal(
    output.users.find((user) => user.userId === 'voter-1')?.pointsByActivityType.poll_vote,
    3,
  );
});

test('RSVP duplicates score once and are reported as mutable toggle risk', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('user-1')],
    rsvps: [
      {
        id: 'rsvp-1',
        entity_type: 'match',
        entity_id: 'match-1',
        user_id: 'user-1',
        status: 'going',
        created_at: '2026-06-22T08:00:00.000Z',
      },
      {
        id: 'rsvp-2',
        entity_type: 'match',
        entity_id: 'match-1',
        user_id: 'user-1',
        status: 'going',
        created_at: '2026-06-22T09:00:00.000Z',
      },
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'user-1')?.total, 2);
  assert.equal(output.toggleRisks.filter((risk) => risk.sourceTable === 'rsvps').length, 2);
});

test('check-ins score home and away fixtures', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('home-user'), profile('away-user')],
    fixtures: [
      { id: 'home-match', home_team: 'FC Nordsjaelland', away_team: 'AGF' },
      { id: 'away-match', home_team: 'AGF', away_team: 'FC Nordsjaelland' },
    ],
    matchCheckins: [
      {
        id: 'home-checkin',
        match_id: 'home-match',
        user_id: 'home-user',
        created_at: '2026-06-22T08:00:00.000Z',
      },
      {
        id: 'away-checkin',
        match_id: 'away-match',
        user_id: 'away-user',
        created_at: '2026-06-22T08:00:00.000Z',
      },
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'home-user')?.total, HOME_CHECKIN_SCORE);
  assert.equal(output.users.find((user) => user.userId === 'away-user')?.total, AWAY_CHECKIN_SCORE);
});

test('candidate rules require profile, two categories, meaningful action and cooldown clearance', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('candidate'), profile('likes-only'), profile('cooldown-user')],
    recentWinnerUserIds: ['cooldown-user'],
    posts: [
      post('candidate-post', 'candidate'),
      post('cooldown-post', 'cooldown-user'),
      post('liked-post', 'likes-only', { created_at: '2026-06-15T10:00:00.000Z' }),
    ],
    comments: [
      {
        id: 'candidate-comment',
        author_id: 'candidate',
        target_type: 'post',
        target_id: 'candidate-post',
        created_at: '2026-06-22T09:00:00.000Z',
      },
      {
        id: 'cooldown-comment',
        author_id: 'cooldown-user',
        target_type: 'post',
        target_id: 'cooldown-post',
        created_at: '2026-06-22T09:00:00.000Z',
      },
    ],
    likes: [
      {
        id: 'received-like',
        user_id: 'candidate',
        target_type: 'post',
        target_id: 'liked-post',
        created_at: '2026-06-22T10:00:00.000Z',
      },
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'candidate')?.candidate, true);
  assert.equal(output.users.find((user) => user.userId === 'likes-only')?.candidate, false);
  assert.deepEqual(
    output.users.find((user) => user.userId === 'cooldown-user')?.candidateExclusionReasons,
    ['weekly_top_fan_cooldown'],
  );
});

test('fan activity registration scores only qualifying statuses', () => {
  const output = calculateWeeklyShadowScore({
    ...BASE_INPUT,
    profiles: [profile('confirmed-user'), profile('pending-payment-user')],
    fanActivityRegistrations: [
      {
        id: 'confirmed',
        fan_activity_id: 'activity-1',
        user_id: 'confirmed-user',
        status: 'confirmed',
        created_at: '2026-06-22T08:00:00.000Z',
      },
      {
        id: 'pending-payment',
        fan_activity_id: 'activity-1',
        user_id: 'pending-payment-user',
        status: 'pending_payment',
        created_at: '2026-06-22T08:00:00.000Z',
      },
    ],
  });

  assert.equal(output.users.find((user) => user.userId === 'confirmed-user')?.total, 4);
  assert.equal(output.users.find((user) => user.userId === 'pending-payment-user')?.total, 0);
});
