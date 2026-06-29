import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCaptureOverview,
  buildDetails,
  buildDedupeOverview,
  buildExpectedCaptureEvents,
  buildLedgerOverview,
  createPseudonymizer,
  parseArgs,
} from '../fan-score-ledger-report.js';

function makeInput(overrides = {}): any {
  return {
    ledgerEvents: [
      {
        id: 'ledger-1',
        user_id: 'user-a',
        activity_type: 'post',
        source_table: 'posts',
        source_id: 'post-1',
        target_type: 'post',
        target_id: 'post-1',
        target_owner_user_id: 'user-a',
        occurred_at: '2026-06-29T12:30:00.000Z',
        cph_week_start: '2026-06-29',
        cph_day: '2026-06-29',
        base_points: 8,
        category: 'post_or_poll',
        meaningful_own_action: true,
        dedupe_key: 'post:post-1:user-a',
        metadata: {},
        revoked_at: null,
      },
      {
        id: 'ledger-2',
        user_id: 'user-b',
        activity_type: 'like_given_post',
        source_table: 'likes_v2',
        source_id: 'like-1',
        target_type: 'post',
        target_id: 'post-1',
        target_owner_user_id: 'user-a',
        occurred_at: '2026-06-29T13:00:00.000Z',
        cph_week_start: '2026-06-29',
        cph_day: '2026-06-29',
        base_points: 1,
        category: 'likes_given',
        meaningful_own_action: false,
        dedupe_key: 'like_given:post:post-1:user-b',
        metadata: {},
        revoked_at: null,
      },
      {
        id: 'ledger-3',
        user_id: 'user-a',
        activity_type: 'like_received_post',
        source_table: 'likes_v2',
        source_id: 'like-1',
        target_type: 'post',
        target_id: 'post-1',
        target_owner_user_id: 'user-a',
        occurred_at: '2026-06-29T13:00:00.000Z',
        cph_week_start: '2026-06-29',
        cph_day: '2026-06-29',
        base_points: 1,
        category: 'likes_received',
        meaningful_own_action: false,
        dedupe_key: 'like_received:post:post-1:from:user-b:to:user-a',
        metadata: {},
        revoked_at: null,
      },
    ],
    allTimeLedgerForExpectedKeys: [],
    posts: [
      {
        id: 'post-1',
        author_id: 'user-a',
        created_at: '2026-06-29T12:30:00.000Z',
        post_type: 'post',
        actor_type: 'user',
        actor_id: 'user-a',
        poll_data: null,
        media_article_provenance: null,
      },
      {
        id: 'post-imported',
        author_id: 'user-a',
        created_at: '2026-06-29T12:40:00.000Z',
        post_type: 'media_article',
        actor_type: 'user',
        actor_id: 'user-a',
        poll_data: null,
        media_article_provenance: null,
      },
    ],
    comments: [],
    likes: [
      {
        id: 'like-1',
        user_id: 'user-b',
        target_type: 'post',
        target_id: 'post-1',
        created_at: '2026-06-29T13:00:00.000Z',
      },
      {
        id: 'like-self',
        user_id: 'user-a',
        target_type: 'post',
        target_id: 'post-1',
        created_at: '2026-06-29T13:05:00.000Z',
      },
    ],
    pollVotes: [],
    rsvps: [],
    matchCheckins: [],
    fanActivityRegistrations: [],
    targetPosts: [
      {
        id: 'post-1',
        author_id: 'user-a',
        created_at: '2026-06-29T12:30:00.000Z',
        post_type: 'post',
        actor_type: 'user',
        actor_id: 'user-a',
        poll_data: null,
        media_article_provenance: null,
      },
    ],
    targetComments: [],
    pollPosts: [],
    fixtures: [],
    appAdminUserIds: [],
    includeDetails: true,
    ...overrides,
  };
}

test('parseArgs defaults to the last seven days', () => {
  const options = parseArgs([], new Date('2026-06-30T12:00:00.000Z'));

  assert.equal(options.since, '2026-06-23T12:00:00.000Z');
  assert.equal(options.until, '2026-06-30T12:00:00.000Z');
  assert.equal(options.includeDetails, false);
});

test('ledger overview summarizes counts without exposing user ids', () => {
  const input = makeInput();
  const overview = buildLedgerOverview(input.ledgerEvents);

  assert.equal(overview.eventCount, 3);
  assert.equal(overview.uniqueUsers, 2);
  assert.equal(overview.byActivityType.post, 1);
  assert.equal(overview.byCategory.likes_received, 1);
  assert.equal(overview.meaningfulOwnActionEvents, 1);
  assert.equal(overview.byCphDay['2026-06-29'], 3);
});

test('capture overview counts exclusions and missing events', () => {
  const input = makeInput();
  const expected = buildExpectedCaptureEvents(input);
  const overview = buildCaptureOverview(input, expected);
  const posts = overview.find((row) => row.sourceTable === 'posts');
  const likes = overview.find((row) => row.sourceTable === 'likes_v2');

  assert.equal(posts?.sourceRows, 2);
  assert.equal(posts?.expectedLedgerEvents, 1);
  assert.equal(posts?.foundLedgerEventsInPeriod, 1);
  assert.equal(posts?.excluded.media_article_not_user_submitted, 1);

  assert.equal(likes?.sourceRows, 2);
  assert.equal(likes?.expectedLedgerEvents, 2);
  assert.equal(likes?.foundLedgerEventsInPeriod, 2);
  assert.equal(likes?.excluded.self_like, 1);
});

test('details pseudonymize users and source ids', () => {
  const input = makeInput();
  const details = buildDetails(input, buildExpectedCaptureEvents(input));
  const serialized = JSON.stringify(details);

  assert.match(serialized, /User A/);
  assert.match(serialized, /User B/);
  assert.doesNotMatch(serialized, /user-a/);
  assert.doesNotMatch(serialized, /user-b/);
  assert.doesNotMatch(serialized, /post:post-1:user-a/);
});

test('dedupe overview flags duplicate ledger keys by hash only', () => {
  const input = makeInput({
    ledgerEvents: [
      ...makeInput().ledgerEvents,
      {
        ...makeInput().ledgerEvents[0],
        id: 'ledger-duplicate',
      },
    ],
  });
  const overview = buildDedupeOverview(input);

  assert.equal(overview.uniqueDedupeKeys, 3);
  assert.equal(overview.duplicateDedupeKeys.length, 1);
  assert.equal(overview.duplicateDedupeKeys[0].count, 2);
  assert.doesNotMatch(overview.duplicateDedupeKeys[0].dedupeKeyHash, /post-1/);
});

test('pseudonymizer is stable for repeated user ids', () => {
  const pseudonymize = createPseudonymizer();

  assert.equal(pseudonymize('raw-user-one'), 'User A');
  assert.equal(pseudonymize('raw-user-two'), 'User B');
  assert.equal(pseudonymize('raw-user-one'), 'User A');
  assert.equal(pseudonymize(null), 'Unknown User');
});
