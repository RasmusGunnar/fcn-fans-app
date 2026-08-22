import type { AppMode } from '../config/appMode';
import { appMode } from '../config/appMode';
import { DEMO_COMMUNITIES } from '../demo/communities';
import { DEMO_PRIMARY_FIXTURE } from '../demo/matches';
import { DEMO_COMMENTS, DEMO_POSTS } from '../demo/posts';
import { DEMO_USERS } from '../demo/users';

export type AppDataLayer =
  | { kind: 'production'; source: 'supabase' }
  | {
      kind: 'demo';
      source: 'local';
      users: typeof DEMO_USERS;
      communities: typeof DEMO_COMMUNITIES;
      posts: typeof DEMO_POSTS;
      comments: typeof DEMO_COMMENTS;
      matches: [typeof DEMO_PRIMARY_FIXTURE];
    };

export const productionDataLayer: AppDataLayer = { kind: 'production', source: 'supabase' };
export const demoDataLayer: AppDataLayer = {
  kind: 'demo',
  source: 'local',
  users: DEMO_USERS,
  communities: DEMO_COMMUNITIES,
  posts: DEMO_POSTS,
  comments: DEMO_COMMENTS,
  matches: [DEMO_PRIMARY_FIXTURE],
};

export function selectAppDataLayer(mode: AppMode): AppDataLayer {
  return mode === 'demo' ? demoDataLayer : productionDataLayer;
}

export const appDataLayer = selectAppDataLayer(appMode);
