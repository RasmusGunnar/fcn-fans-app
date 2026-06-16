import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getWeeklyTopFanReasonType,
  selectWeeklyTopFanWinner,
  type WeeklyTopFanCandidate,
} from '../weeklyTopFanSelection.js';

function candidate(
  userId: string,
  overrides: Partial<WeeklyTopFanCandidate> = {},
): WeeklyTopFanCandidate {
  const postCount = overrides.postCount ?? 0;
  const commentCount = overrides.commentCount ?? 0;
  const checkinCount = overrides.checkinCount ?? 0;
  const activityVariety =
    overrides.activityVariety ??
    [postCount > 0, commentCount > 0, checkinCount > 0].filter(Boolean).length;

  return {
    userId,
    postCount,
    commentCount,
    checkinCount,
    postLikesReceived: overrides.postLikesReceived ?? 0,
    commentLikesReceived: overrides.commentLikesReceived ?? 0,
    activityVariety,
    weeklyScore: overrides.weeklyScore ?? 0,
    latestActivityAt: overrides.latestActivityAt ?? '2026-06-15T12:00:00.000Z',
  };
}

test('strict eligible highest score wins', () => {
  const result = selectWeeklyTopFanWinner(
    [
      candidate('strict-lower', { weeklyScore: 30, postCount: 1, commentCount: 1 }),
      candidate('strict-higher', { weeklyScore: 42, postCount: 2, checkinCount: 1 }),
      candidate('fallback-only', { weeklyScore: 50, postCount: 1 }),
    ],
    new Set(),
  );

  assert.equal(result.winner?.userId, 'strict-higher');
  assert.equal(result.selectionMode, 'strict');
});

test('low-score fallback remains allowed', () => {
  const result = selectWeeklyTopFanWinner(
    [
      candidate('low-score-lower', { weeklyScore: 8, postCount: 1 }),
      candidate('low-score-higher', { weeklyScore: 18, checkinCount: 1 }),
    ],
    new Set(),
  );

  assert.equal(result.winner?.userId, 'low-score-higher');
  assert.equal(result.selectionMode, 'fallback');
});

test('fallback respects cooldown', () => {
  const result = selectWeeklyTopFanWinner(
    [
      candidate('recent-winner', { weeklyScore: 18, postCount: 1 }),
      candidate('available-winner', { weeklyScore: 12, commentCount: 1 }),
    ],
    new Set(['recent-winner']),
  );

  assert.equal(result.winner?.userId, 'available-winner');
  assert.equal(result.selectionMode, 'fallback');
});

test('recent winner is skipped even if highest fallback score', () => {
  const result = selectWeeklyTopFanWinner(
    [
      candidate('recent-winner', { weeklyScore: 24, checkinCount: 1 }),
      candidate('available-winner', { weeklyScore: 2, postLikesReceived: 2 }),
    ],
    new Set(['recent-winner']),
  );

  assert.equal(result.winner?.userId, 'available-winner');
  assert.equal(result.selectionMode, 'fallback');
});

test('no winner when all candidates are in cooldown', () => {
  const result = selectWeeklyTopFanWinner(
    [
      candidate('recent-one', { weeklyScore: 30, postCount: 1, commentCount: 1 }),
      candidate('recent-two', { weeklyScore: 10, checkinCount: 1 }),
    ],
    new Set(['recent-one', 'recent-two']),
  );

  assert.equal(result.winner, null);
  assert.equal(result.selectionMode, null);
  assert.deepEqual(
    result.fallbackCandidates.map((entry) => entry.userId),
    [],
  );
});

test('likes-only winner reason type is activity, not checkin', () => {
  assert.equal(
    getWeeklyTopFanReasonType({
      candidate: candidate('likes-only', { weeklyScore: 2, postLikesReceived: 2 }),
      topPost: null,
      topComment: null,
    }),
    'activity',
  );
});

test('check-in-only winner remains checkin', () => {
  assert.equal(
    getWeeklyTopFanReasonType({
      candidate: candidate('checkin-only', { weeklyScore: 10, checkinCount: 1 }),
      topPost: null,
      topComment: null,
    }),
    'checkin',
  );
});
