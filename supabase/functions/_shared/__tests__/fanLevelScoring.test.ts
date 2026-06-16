import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AWAY_CHECKIN_SCORE,
  calculateFanLevelScores,
  HOME_CHECKIN_SCORE,
  type FanLevelScoreInput,
  type ProfileRow,
} from '../fanLevelScoring.js';

const BASE_TIME = '2026-06-16T10:00:00.000Z';
const EMPTY_INPUT: FanLevelScoreInput = {
  profiles: [],
  posts: [],
  comments: [],
  likes: [],
  checkins: [],
  fixtures: [],
};

function profile(id: string): ProfileRow {
  return { id, fan_level_key: 'new_fan' };
}

function scoreFor(userId: string, input: Partial<FanLevelScoreInput>): number {
  const profiles = [profile(userId), ...(input.profiles ?? [])];
  const result = calculateFanLevelScores({
    ...EMPTY_INPUT,
    ...input,
    profiles,
  });

  return result.scores.get(userId) ?? 0;
}

function checkInScoreForFixture(homeTeam: string, awayTeam: string): number {
  return scoreFor('user-1', {
    fixtures: [
      {
        id: 'fixture-1',
        home_team: homeTeam,
        away_team: awayTeam,
      },
    ],
    checkins: [
      {
        match_id: 'fixture-1',
        user_id: 'user-1',
        created_at: BASE_TIME,
      },
    ],
  });
}

test('normal user post scores post-creation points', () => {
  assert.equal(
    scoreFor('user-1', {
      posts: [
        {
          id: 'post-1',
          author_id: 'user-1',
          actor_type: 'user',
          post_type: 'fan_post',
          created_at: BASE_TIME,
        },
      ],
    }),
    8,
  );
});

test('media_article post scores no personal post-creation points', () => {
  assert.equal(
    scoreFor('admin-1', {
      posts: [
        {
          id: 'article-1',
          author_id: 'admin-1',
          actor_type: 'user',
          post_type: 'media_article',
          created_at: BASE_TIME,
        },
      ],
    }),
    0,
  );
});

test('community actor post scores no personal post-creation points', () => {
  assert.equal(
    scoreFor('moderator-1', {
      posts: [
        {
          id: 'community-post-1',
          author_id: 'moderator-1',
          actor_type: 'community',
          post_type: 'fan_post',
          created_at: BASE_TIME,
        },
      ],
    }),
    0,
  );
});

test('comments still score', () => {
  assert.equal(
    scoreFor('user-1', {
      comments: [
        {
          id: 'comment-1',
          author_id: 'user-1',
          target_type: 'post',
          target_id: 'post-1',
          created_at: BASE_TIME,
        },
      ],
    }),
    2,
  );
});

test('likes received still score', () => {
  assert.equal(
    scoreFor('author-1', {
      profiles: [profile('liker-1')],
      posts: [
        {
          id: 'post-1',
          author_id: 'author-1',
          actor_type: 'user',
          post_type: 'fan_post',
          created_at: BASE_TIME,
        },
      ],
      likes: [
        {
          user_id: 'liker-1',
          target_type: 'post',
          target_id: 'post-1',
          created_at: BASE_TIME,
        },
      ],
    }),
    9,
  );
});

test('match check-ins still score home fixtures as home check-ins', () => {
  assert.equal(checkInScoreForFixture('FC Nordsjaelland', 'AGF'), HOME_CHECKIN_SCORE);
});

test('match check-ins classify FC Nordsjaelland away fixtures', () => {
  assert.equal(checkInScoreForFixture('AGF', 'FC Nordsjaelland'), AWAY_CHECKIN_SCORE);
});

test('match check-ins classify FC Nordsjaelland with Danish ae away fixtures', () => {
  assert.equal(checkInScoreForFixture('AGF', 'FC Nordsj\u00e6lland'), AWAY_CHECKIN_SCORE);
});

test('match check-ins classify historical mojibake FC Nordsjaelland away fixtures', () => {
  assert.equal(checkInScoreForFixture('AGF', 'FC Nordsj\u00c3\u00a6lland'), AWAY_CHECKIN_SCORE);
});

test('daily post cap still applies', () => {
  assert.equal(
    scoreFor('user-1', {
      posts: [
        {
          id: 'post-1',
          author_id: 'user-1',
          actor_type: 'user',
          post_type: 'fan_post',
          created_at: '2026-06-16T08:00:00.000Z',
        },
        {
          id: 'post-2',
          author_id: 'user-1',
          actor_type: 'user',
          post_type: 'fan_post',
          created_at: '2026-06-16T09:00:00.000Z',
        },
        {
          id: 'post-3',
          author_id: 'user-1',
          actor_type: 'user',
          post_type: 'fan_post',
          created_at: '2026-06-16T10:00:00.000Z',
        },
      ],
    }),
    16,
  );
});
