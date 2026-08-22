import type { FanLevelKey } from '../types/fan';

export type DemoUser = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  fanLevelKey: FanLevelKey;
};

const names = [
  ['Rasmus', 'Demo'],
  ['Mikkel', 'Jørgensen'],
  ['Sofie', 'Larsen'],
  ['Andreas', 'Nielsen'],
  ['Christian', 'Holm'],
  ['Emil', 'Andersen'],
  ['Jonas', 'Petersen'],
  ['Louise', 'Madsen'],
  ['Mathias', 'Sørensen'],
  ['Freja', 'Kristensen'],
  ['Nikolaj', 'Berg'],
  ['Camilla', 'Mortensen'],
  ['Oliver', 'Thomsen'],
  ['Ida', 'Henriksen'],
  ['Kasper', 'Lund'],
  ['Laura', 'Kjær'],
  ['Sebastian', 'Bach'],
  ['Emma', 'Friis'],
  ['Victor', 'Dahl'],
  ['Anna', 'Lind'],
] as const;

const fanLevels: FanLevelKey[] = [
  'community_core',
  'regular_voice',
  'community_member',
  'dedicated',
  'regular_voice',
  'community_member',
  'community_core',
  'regular_voice',
  'dedicated',
  'community_member',
  'new_fan',
  'regular_voice',
  'community_core',
  'community_member',
  'dedicated',
  'regular_voice',
  'community_member',
  'new_fan',
  'community_core',
  'regular_voice',
];

export const DEMO_USERS: DemoUser[] = names.map(([firstName, lastName], index) => ({
  id: `demo-user-${String(index + 1).padStart(2, '0')}`,
  displayName: `${firstName} ${lastName}`,
  username: `${firstName}${lastName}`.toLowerCase().replace(/ø/g, 'oe').replace(/æ/g, 'ae'),
  avatarUrl: null,
  fanLevelKey: fanLevels[index],
}));

export const DEMO_CURRENT_USER = DEMO_USERS[0];

export const DEMO_AUTH_USER = {
  id: DEMO_CURRENT_USER.id,
  email: 'demo@fcnfans.local',
  user_metadata: {
    display_name: DEMO_CURRENT_USER.displayName,
    username: DEMO_CURRENT_USER.username,
    avatar_url: null,
  },
  app_metadata: { provider: 'demo' },
};

export const DEMO_AUTH_SESSION = {
  access_token: 'demo-local-session',
  refresh_token: 'demo-local-session',
  expires_in: 60 * 60 * 24,
  token_type: 'bearer',
  user: DEMO_AUTH_USER,
};

export const DEMO_PROFILE_MAP = Object.fromEntries(
  DEMO_USERS.map((user) => [
    user.id,
    {
      display_name: user.displayName,
      username: user.username,
      avatar_url: user.avatarUrl,
      fan_level_key: user.fanLevelKey,
    },
  ]),
);

export function getDemoUser(userId: string): DemoUser | null {
  return DEMO_USERS.find((user) => user.id === userId) ?? null;
}
