import type { CommentPreview } from '../services/likesApi';
import type { FeedItem } from '../types/feed';
import { DEMO_COMMUNITIES } from './communities';
import { DEMO_BUS_TRIP, DEMO_EVENT, DEMO_FAN_ACTIVITIES, DEMO_PRIMARY_FIXTURE } from './matches';
import { DEMO_COMMENTS, DEMO_ENGAGEMENT, DEMO_POSTS, getDemoCommentPreviews } from './posts';
import { DEMO_PROFILE_MAP } from './users';

export type DemoFeedSnapshot = {
  posts: typeof DEMO_POSTS;
  feedItems: FeedItem[];
  homeFeedItems: FeedItem[];
  communityMap: Record<string, string>;
  profileMap: typeof DEMO_PROFILE_MAP;
  likeMap: Record<string, { liked: boolean; likes: number }>;
  commentCountMap: Record<string, number>;
  commentPreviewMap: Record<string, CommentPreview[]>;
  attendanceMap: Record<string, { count: number; avatars: string[]; isGoing: boolean }>;
};

function postFeedItems(): FeedItem[] {
  return DEMO_POSTS.map((post) => {
    const engagement = DEMO_ENGAGEMENT[`post:${post.id}`];
    return {
      kind: 'post' as const,
      id: post.id,
      data: {
        ...post,
        likeCount: engagement.likes,
        commentCount: engagement.comments,
        engagementCount: engagement.likes + engagement.comments,
        sortDate: post.createdAt,
      },
    };
  });
}

function supplementaryFeedItems(): FeedItem[] {
  const match: FeedItem = {
    kind: 'match',
    id: DEMO_PRIMARY_FIXTURE.id,
    data: {
      id: DEMO_PRIMARY_FIXTURE.id,
      kickoffAt: DEMO_PRIMARY_FIXTURE.kickoff_at,
      home: DEMO_PRIMARY_FIXTURE.home_team,
      away: DEMO_PRIMARY_FIXTURE.away_team,
      homeLogo: null,
      awayLogo: null,
      venue: DEMO_PRIMARY_FIXTURE.venue,
      venueCity: DEMO_PRIMARY_FIXTURE.venue_city,
      competition: DEMO_PRIMARY_FIXTURE.competition,
      round: DEMO_PRIMARY_FIXTURE.round,
      homeTeamProviderId: DEMO_PRIMARY_FIXTURE.home_team_provider_id,
      likeCount: 28,
      commentCount: 9,
      engagementCount: 37,
      sortDate: DEMO_PRIMARY_FIXTURE.kickoff_at,
    },
  };
  const event: FeedItem = {
    kind: 'event',
    id: DEMO_EVENT.id,
    data: {
      id: DEMO_EVENT.id,
      title: DEMO_EVENT.title,
      startAt: DEMO_EVENT.start_at,
      location: DEMO_EVENT.location_name,
      description: DEMO_EVENT.description,
      organizerName: 'Farum Fans',
      organizerGroupId: DEMO_EVENT.organizer_group_id,
      organizerType: DEMO_EVENT.organizer_type,
      organizerId: DEMO_EVENT.organizer_id,
      creatorUserId: DEMO_EVENT.creator_user_id,
      createdBy: DEMO_EVENT.created_by,
      createdAt: DEMO_EVENT.created_at,
      likeCount: 16,
      commentCount: 4,
      engagementCount: 20,
      sortDate: DEMO_EVENT.created_at,
    },
  };
  const busTrip: FeedItem = {
    kind: 'bus_trip',
    id: DEMO_BUS_TRIP.id,
    data: {
      id: DEMO_BUS_TRIP.id,
      title: DEMO_BUS_TRIP.title,
      startAt: DEMO_BUS_TRIP.start_at,
      location: DEMO_BUS_TRIP.departure_place,
      description: DEMO_BUS_TRIP.description,
      organizerName: 'Udebaneture',
      organizerGroupId: DEMO_BUS_TRIP.organizer_group_id,
      createdAt: DEMO_BUS_TRIP.created_at,
      eventType: 'bus_trip',
      likeCount: 24,
      commentCount: 11,
      engagementCount: 35,
      sortDate: DEMO_BUS_TRIP.created_at,
    },
  };
  const activity = DEMO_FAN_ACTIVITIES[0];
  const fanActivity: FeedItem = {
    kind: 'fan_activity',
    id: activity.id,
    data: {
      id: activity.id,
      parentType: activity.parent_type,
      parentId: activity.parent_id,
      parentIsUpcoming: true,
      type: activity.type,
      title: activity.title,
      body: activity.body,
      startsAt: activity.starts_at,
      endsAt: activity.ends_at,
      locationName: activity.location_name,
      locationAddress: activity.location_address,
      communityId: activity.community_id,
      communityName: activity.community?.name,
      coverUrl: activity.cover_url,
      ctaLabel: activity.cta_label,
      ctaUrl: activity.cta_url,
      registrationEnabled: activity.registration_enabled,
      registrationCapacity: activity.registration_capacity,
      registrationPriceDkk: activity.registration_price_dkk,
      registrationPaymentMode: activity.registration_payment_mode,
      registrationReservedCount: 34,
      createdAt: activity.created_at,
      sortDate: activity.created_at,
    },
  };
  const featuredCommunity = DEMO_COMMUNITIES.find((community) => community.name === 'Udebaneture')!;
  const community: FeedItem = {
    kind: 'community',
    id: `community:${featuredCommunity.id}`,
    data: {
      id: `community:${featuredCommunity.id}`,
      communityId: featuredCommunity.id,
      name: featuredCommunity.name,
      description: featuredCommunity.description,
      createdAt: featuredCommunity.created_at,
      creatorId: featuredCommunity.created_by,
      avatarUrl: featuredCommunity.avatar_url,
      coverUrl: null,
      debugSource: 'local',
      sortDate: featuredCommunity.created_at,
    },
  };

  return [match, event, busTrip, fanActivity, community];
}

export function createDemoFeedSnapshot(): DemoFeedSnapshot {
  const posts = DEMO_POSTS.map((post) => ({
    ...post,
    media: post.media?.map((media) => ({ ...media })),
  }));
  const items = [...postFeedItems(), ...supplementaryFeedItems()];
  const likeMap: DemoFeedSnapshot['likeMap'] = {};
  const commentCountMap: DemoFeedSnapshot['commentCountMap'] = {};
  const commentPreviewMap: DemoFeedSnapshot['commentPreviewMap'] = {};

  Object.entries(DEMO_ENGAGEMENT).forEach(([key, engagement]) => {
    likeMap[key] = { liked: engagement.liked, likes: engagement.likes };
    commentCountMap[key] = engagement.comments;
    const [targetType, targetId] = key.split(':');
    commentPreviewMap[key] = getDemoCommentPreviews(targetType, targetId);
  });

  likeMap[`match:${DEMO_PRIMARY_FIXTURE.id}`] = { liked: false, likes: 28 };
  commentCountMap[`match:${DEMO_PRIMARY_FIXTURE.id}`] = 9;
  commentPreviewMap[`match:${DEMO_PRIMARY_FIXTURE.id}`] = getDemoCommentPreviews(
    'match',
    DEMO_PRIMARY_FIXTURE.id,
  );
  likeMap[`event:${DEMO_EVENT.id}`] = { liked: false, likes: 16 };
  commentCountMap[`event:${DEMO_EVENT.id}`] = 4;
  likeMap[`bus_trip:${DEMO_BUS_TRIP.id}`] = { liked: false, likes: 24 };
  commentCountMap[`bus_trip:${DEMO_BUS_TRIP.id}`] = 11;

  return {
    posts,
    feedItems: items,
    homeFeedItems: items,
    communityMap: Object.fromEntries(
      DEMO_COMMUNITIES.map((community) => [community.id, community.name]),
    ),
    profileMap: { ...DEMO_PROFILE_MAP },
    likeMap,
    commentCountMap,
    commentPreviewMap,
    attendanceMap: {
      [DEMO_EVENT.id]: { count: 34, avatars: [], isGoing: true },
      [DEMO_BUS_TRIP.id]: { count: 41, avatars: [], isGoing: true },
    },
  };
}

export const DEMO_COMMENT_COUNT = DEMO_COMMENTS.length;
