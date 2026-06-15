import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHomePostFeedTargetFilter,
  HOME_POST_FETCH_LIMIT,
  isHomePostFeedTargets,
  selectHomePostRows,
} from '../homeFeedQuery';

type TestPostRow = {
  id: string;
  feed_targets?: unknown;
};

test('Home query uses JSONB containment and preserves legacy null or empty targets', () => {
  assert.equal(
    buildHomePostFeedTargetFilter(),
    'feed_targets.cs.["home"],feed_targets.is.null,feed_targets.eq.[]',
  );
  assert.equal(isHomePostFeedTargets(['home']), true);
  assert.equal(isHomePostFeedTargets(['home', 'community:comm-1']), true);
  assert.equal(isHomePostFeedTargets(null), true);
  assert.equal(isHomePostFeedTargets(undefined), true);
  assert.equal(isHomePostFeedTargets([]), true);
});

test('Home query scope excludes community-only posts', () => {
  assert.equal(isHomePostFeedTargets(['community:comm-1']), false);
  assert.equal(isHomePostFeedTargets(['community:comm-1', 'community:comm-2']), false);
});

test('community-only rows cannot consume the Home fetch limit', () => {
  const communityOnlyRows: TestPostRow[] = Array.from(
    { length: HOME_POST_FETCH_LIMIT },
    (_, index) => ({
      id: `community-${index}`,
      feed_targets: ['community:comm-1'],
    }),
  );
  const homeRows: TestPostRow[] = Array.from(
    { length: HOME_POST_FETCH_LIMIT },
    (_, index) => ({
      id: `home-${index}`,
      feed_targets: ['home'],
    }),
  );

  const result = selectHomePostRows([...communityOnlyRows, ...homeRows]);

  assert.equal(result.length, HOME_POST_FETCH_LIMIT);
  assert.ok(result.every((row) => row.id.startsWith('home-')));
});
