import type { Community, CommunityMember, CommunityMembership } from '../services/communities';
import { demoMinutesAgo } from './time';
import { DEMO_CURRENT_USER, DEMO_USERS } from './users';

export const DEMO_COMMUNITY_IDS = {
  ganlose: 'demo-community-ganlose',
  farum: 'demo-community-farum',
  away: 'demo-community-away',
  tifo: 'demo-community-tifo',
  northStand: 'demo-faction-north-stand',
  redYellow: 'demo-faction-red-yellow',
} as const;

export const DEMO_COMMUNITIES: Community[] = [
  {
    id: DEMO_COMMUNITY_IDS.ganlose,
    name: 'Ganløse Fans',
    mention_key: 'ganlosefans',
    description: 'For FCN-fans i og omkring Ganløse. Samkørsel, kampdage og lokal FCN-snak.',
    type: 'community',
    owner_id: 'demo-user-02',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Ganløse, Egedal',
    location_geohash: null,
    lat: 55.7917,
    lng: 12.2647,
    place_name: 'Ganløse',
    geocoded_at: demoMinutesAgo(60 * 24 * 30),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 220),
    created_by: 'demo-user-02',
    member_count: 37,
  },
  {
    id: DEMO_COMMUNITY_IDS.farum,
    name: 'Farum Fans',
    mention_key: 'farumfans',
    description: 'Det lokale samlingspunkt for FCN-fans i Farum – før, under og efter kampen.',
    type: 'community',
    owner_id: 'demo-user-07',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Farum',
    location_geohash: null,
    lat: 55.8123,
    lng: 12.373,
    place_name: 'Farum',
    geocoded_at: demoMinutesAgo(60 * 24 * 45),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 400),
    created_by: 'demo-user-07',
    member_count: 126,
  },
  {
    id: DEMO_COMMUNITY_IDS.away,
    name: 'Udebaneture',
    mention_key: 'udebaneture',
    description:
      'For os der følger FCN på udebane. Transport, billetter, mødesteder, warm-up og koordinering.',
    type: 'community',
    owner_id: 'demo-user-05',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Hele Danmark',
    location_geohash: null,
    lat: 55.6761,
    lng: 12.5683,
    place_name: 'Danmark',
    geocoded_at: demoMinutesAgo(60 * 24 * 28),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 510),
    created_by: 'demo-user-05',
    member_count: 142,
  },
  {
    id: DEMO_COMMUNITY_IDS.tifo,
    name: 'Tifo & Stemning',
    mention_key: 'tifoogstemning',
    description: 'Tifo, bannere, flag, sange og idéer til mere liv på tribunen.',
    type: 'community',
    owner_id: 'demo-user-12',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Farum',
    location_geohash: null,
    lat: 55.8164,
    lng: 12.3519,
    place_name: 'Right to Dream Park',
    geocoded_at: demoMinutesAgo(60 * 24 * 18),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 330),
    created_by: 'demo-user-12',
    member_count: 84,
  },
  {
    id: DEMO_COMMUNITY_IDS.northStand,
    name: 'Nordtribunens Venner',
    mention_key: 'nordtribunensvenner',
    description: 'En uofficiel demo-fangruppe for fællesskab, sange og stemning på tribunen.',
    type: 'fan_faction',
    owner_id: 'demo-user-15',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Farum',
    location_geohash: null,
    lat: 55.8157,
    lng: 12.3508,
    place_name: 'Farum',
    geocoded_at: demoMinutesAgo(60 * 24 * 12),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 180),
    created_by: 'demo-user-15',
    member_count: 58,
  },
  {
    id: DEMO_COMMUNITY_IDS.redYellow,
    name: 'Rød-gul Puls',
    mention_key: 'rodgulpuls',
    description: 'En neutral demo-fraktion for fans, der vil løfte stemningen sammen.',
    type: 'fan_faction',
    owner_id: 'demo-user-09',
    avatar_path: null,
    avatar_url: null,
    avatar_kind: null,
    cover_path: null,
    location_label: 'Nordsjælland',
    location_geohash: null,
    lat: 55.84,
    lng: 12.42,
    place_name: 'Nordsjælland',
    geocoded_at: demoMinutesAgo(60 * 24 * 9),
    visibility: 'public',
    created_at: demoMinutesAgo(60 * 24 * 140),
    created_by: 'demo-user-09',
    member_count: 41,
  },
];

export const DEMO_COMMUNITY_ROLE_MAP: Record<string, 'owner' | 'admin' | 'member'> = {
  [DEMO_COMMUNITY_IDS.ganlose]: 'member',
  [DEMO_COMMUNITY_IDS.farum]: 'member',
  [DEMO_COMMUNITY_IDS.away]: 'member',
  [DEMO_COMMUNITY_IDS.tifo]: 'member',
};

export function getDemoCommunity(communityId: string): Community | null {
  return DEMO_COMMUNITIES.find((community) => community.id === communityId) ?? null;
}

export function getDemoMembership(communityId: string): CommunityMembership | null {
  const role = DEMO_COMMUNITY_ROLE_MAP[communityId];
  if (!role) return null;
  return {
    id: `demo-membership-${communityId}-${DEMO_CURRENT_USER.id}`,
    community_id: communityId,
    user_id: DEMO_CURRENT_USER.id,
    role,
    joined_at: demoMinutesAgo(60 * 24 * 90),
  };
}

export function getDemoCommunityMembers(communityId: string): CommunityMember[] {
  const community = getDemoCommunity(communityId);
  if (!community) return [];

  return DEMO_USERS.slice(0, 12).map((user, index) => ({
    id: `demo-member-${communityId}-${user.id}`,
    community_id: communityId,
    user_id: user.id,
    role: user.id === community.owner_id ? 'owner' : index === 4 ? 'admin' : 'member',
    joined_at: demoMinutesAgo(60 * 24 * (20 + index * 7)),
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
  }));
}
