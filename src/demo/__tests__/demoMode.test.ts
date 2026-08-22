import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppMode, DEMO_WRITE_BLOCK_MESSAGE } from '../../config/appMode';
import { selectAppDataLayer } from '../../data/appDataLayer';
import { createDemoSafeSupabaseClient } from '../../lib/supabaseSafety';
import { DEMO_COMMUNITIES } from '../communities';
import {
  createMutationAdapter,
  getDemoLikeState,
  resetDemoInteractions,
  toggleDemoLike,
} from '../interactions';
import { DEMO_PRIMARY_FIXTURE } from '../matches';
import { DEMO_COMMENTS, DEMO_POSTS } from '../posts';
import { DEMO_USERS } from '../users';

test('production mode selects the production data layer', () => {
  assert.equal(resolveAppMode({}), 'production');
  assert.equal(resolveAppMode({ EXPO_PUBLIC_APP_MODE: 'production' }), 'production');
  assert.deepEqual(selectAppDataLayer('production'), {
    kind: 'production',
    source: 'supabase',
  });
});

test('demo mode selects the local demo data layer', () => {
  assert.equal(resolveAppMode({ EXPO_PUBLIC_APP_MODE: ' Demo ' }), 'demo');
  const layer = selectAppDataLayer('demo');
  assert.equal(layer.kind, 'demo');
  assert.equal(layer.source, 'local');
});

test('demo layer provides users, communities, posts, comments and matches', () => {
  assert.equal(DEMO_USERS.length, 20);
  assert.ok(DEMO_COMMUNITIES.some((community) => community.name === 'Ganløse Fans'));
  assert.ok(DEMO_COMMUNITIES.some((community) => community.name === 'Udebaneture'));
  assert.ok(DEMO_POSTS.length >= 15 && DEMO_POSTS.length <= 25);
  assert.ok(DEMO_COMMENTS.length > 0);
  assert.equal(DEMO_PRIMARY_FIXTURE.id, 'demo-match-next');
  assert.ok(DEMO_POSTS.some((post) => post.text.includes('Rørvig')));
  assert.ok(DEMO_POSTS.some((post) => post.text.includes('warm-up')));
  assert.ok(DEMO_POSTS.filter((post) => post.poll_data).length >= 2);
});

test('demo mutation adapter never calls the production mutation port', async () => {
  let productionCallCount = 0;
  const adapter = createMutationAdapter('demo', {
    async toggleLike() {
      productionCallCount += 1;
      return true;
    },
  });

  await adapter.toggleLike('post', 'demo-post-01', 'demo-user-01', false);
  assert.equal(productionCallCount, 0);
});

test('demo likes change local state only', () => {
  resetDemoInteractions();
  const before = getDemoLikeState('post', 'demo-post-01');
  const after = toggleDemoLike('post', 'demo-post-01');
  assert.equal(after.liked, !before.liked);
  assert.equal(after.likes, before.likes + 1);
  resetDemoInteractions();
  assert.deepEqual(getDemoLikeState('post', 'demo-post-01'), before);
});

test('global demo client blocks table, rpc, storage, auth and function writes', () => {
  let productionWrites = 0;
  const query = {
    select: () => query,
    insert: () => {
      productionWrites += 1;
      return query;
    },
  };
  const bucket = {
    getPublicUrl: () => ({ data: { publicUrl: 'local' } }),
    upload: () => {
      productionWrites += 1;
    },
  };
  const client = {
    from: () => query,
    rpc: () => {
      productionWrites += 1;
    },
    storage: { from: () => bucket },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: () => {
        productionWrites += 1;
      },
    },
    functions: {
      invoke: () => {
        productionWrites += 1;
      },
    },
  };
  const safe = createDemoSafeSupabaseClient(client, true);

  const blockedCalls = [
    () => safe.from().insert(),
    () => safe.rpc(),
    () => safe.storage.from().upload(),
    () => safe.auth.signOut(),
    () => safe.functions.invoke(),
  ];

  blockedCalls.forEach((call) => {
    assert.throws(call, (error: Error) => error.message.includes(DEMO_WRITE_BLOCK_MESSAGE));
  });
  assert.equal(productionWrites, 0);
});
