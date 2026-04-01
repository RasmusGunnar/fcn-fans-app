import React, { createContext, useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import {
  fetchHomeCommunityFeedItems,
  type CommunityFeedSource,
} from '../services/communityFeedApi';
import {
  fetchBusTripsUpcoming,
  fetchEventsUpcoming,
  type BusTrip,
  type Event,
} from '../services/eventsApi';
import { fetchHomeFanActivities, type FanActivity } from '../services/fanActivities';
import {
  fetchCommentCounts,
  fetchCommentPreviews,
  fetchLikeStates,
  fetchMyLikedIds,
  toggleLike as toggleLikeApi,
  type CommentPreview,
  type LikeTargetType,
} from '../services/likesApi';
import { fetchNewsItems } from '../services/newsApi';
import { fetchLatestPublishedWeeklyTopFan } from '../services/weeklyTopFanApi';
import { FeedItem } from '../types/feed';
import type { FanLevelKey } from '../types/fan';
import { NewsItem } from '../types/news';
import { Post } from '../types/post';
import {
  buildFeedItemsFromSources,
  buildHomeFeedItemsFromSources,
  getFeedItemCreatedAt,
  getHomeRankingScore,
  getHomeSortDate,
  HOME_FEED_AUDIT_DEBUG_ENABLED,
  isHomePost,
  sortFeedItemsByDate,
  sortHomeFeedItems,
  toCommunityFeedItem,
  toPostFeedItem,
  withFeedEngagementSummary,
} from '../utils/homeFeed';
import { resolveAvatarUrl } from '../utils/avatar';
import { normalizeMedia } from '../utils/media';
import { targetKey } from '../utils/targetKey';
import type { ProfileMap } from '../utils/actor';

type FeedProfileEntry = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  fan_level_key: FanLevelKey | null;
};

const FEED_PROFILE_SELECT_ATTEMPTS = [
  'id, display_name, username, avatar_url, fan_level_key',
  'id, display_name, username, avatar_url',
  'id, display_name, avatar_url, fan_level_key',
  'id, display_name, avatar_url',
] as const;

async function fetchFeedProfilesByIds(
  authorIds: string[],
): Promise<Record<string, FeedProfileEntry>> {
  if (authorIds.length === 0) {
    return {};
  }

  for (const select of FEED_PROFILE_SELECT_ATTEMPTS) {
    const { data, error } = await supabase.from('profiles').select(select).in('id', authorIds);

    if (error) {
      logger.warn('[FeedProvider] profile lookup failed for select:', { select, error });
      continue;
    }

    const profileMap: Record<string, FeedProfileEntry> = {};
    (data || []).forEach((profile: any) => {
      profileMap[profile.id] = {
        display_name: profile.display_name ?? null,
        username: 'username' in profile ? (profile.username ?? null) : null,
        avatar_url: profile.avatar_url ?? null,
        fan_level_key: 'fan_level_key' in profile ? (profile.fan_level_key ?? null) : null,
      };
    });

    return profileMap;
  }

  return {};
}

interface FeedContextType {
  posts: Post[];
  feedItems: FeedItem[]; // Combined feed using unified FeedItem type
  homeFeedItems: FeedItem[]; // Home-specific feed with early post filtering
  communityMap: Record<string, string>; // Map of community ID -> name
  profileMap: Record<
    string,
    {
      display_name: string | null;
      username?: string | null;
      avatar_url: string | null;
      fan_level_key: FanLevelKey | null;
    }
  >; // Map of user ID -> profile
  likeMap: Record<string, { liked: boolean; likes: number }>; // Like states by "${kind}:${id}"
  commentCountMap: Record<string, number>; // Comment counts by "${kind}:${id}"
  commentPreviewMap: Record<string, CommentPreview[]>; // Comment previews by "${kind}:${id}"
  attendanceMap: Record<string, { count: number; avatars: string[]; isGoing: boolean }>; // Attendance by event/bus_trip ID
  addPost: (post: Post) => void;
  addCommunityFeedItem: (community: CommunityFeedSource) => void;
  removePost: (postId: string) => void;
  removeNews: (newsId: string) => void;
  fetchPosts: () => Promise<void>;
  hydratePostEngagement: (input: {
    postId: string;
    liked: boolean;
    likes: number;
    commentsCount: number;
    commentPreviews: CommentPreview[];
  }) => void;
  toggleLike: (kind: LikeTargetType, id: string, userId: string) => Promise<void>;
  incrementCommentCount: (kind: LikeTargetType, id: string) => void;
  addCommentPreview: (kind: LikeTargetType, id: string, comment: CommentPreview) => void;
  loading: boolean;
  error: string | null;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

function withPostAuthorProfile(post: Post, profile?: FeedProfileEntry | null): Post {
  const displayName =
    profile?.display_name?.trim() ||
    post.authorDisplayName?.trim() ||
    post.authorName?.trim() ||
    null;

  return {
    ...post,
    authorName: displayName || post.authorName || 'Fan',
    authorDisplayName: displayName,
    authorAvatarUrl: profile?.avatar_url ?? post.authorAvatarUrl ?? null,
    authorFanLevelKey: profile?.fan_level_key ?? post.authorFanLevelKey ?? null,
  };
}

function mergeCommunityFeedEntries(
  localEntries: CommunityFeedSource[],
  persistedEntries: CommunityFeedSource[],
): CommunityFeedSource[] {
  const communityFeedMap = new Map<string, CommunityFeedSource>();

  localEntries.forEach((community) => {
    communityFeedMap.set(community.community_id, {
      ...community,
      debug_source: community.debug_source ?? 'local',
    });
  });

  persistedEntries.forEach((community) => {
    const existingEntry = communityFeedMap.get(community.community_id);
    communityFeedMap.set(community.community_id, {
      ...community,
      debug_source: existingEntry ? 'local+persisted' : (community.debug_source ?? 'persisted'),
    });
  });

  return Array.from(communityFeedMap.values());
}

function logHomeFeedSnapshot(stage: string, items: FeedItem[], baseDate: Date) {
  if (!HOME_FEED_AUDIT_DEBUG_ENABLED) {
    return;
  }

  const safeItems = items.filter(
    (item): item is FeedItem =>
      Boolean(item) &&
      typeof item.id === 'string' &&
      typeof item.kind === 'string' &&
      typeof item.data === 'object' &&
      item.data !== null,
  );

  if (__DEV__ && safeItems.length !== items.length) {
    logger.warn('[FeedProvider][homeFeed] Dropped invalid items before snapshot logging.', {
      stage,
      received: items.length,
      kept: safeItems.length,
    });
  }

  logger.log(
    `[FeedProvider][homeFeed][${stage}]`,
    safeItems.slice(0, 20).map((item, index) => ({
      rank: index + 1,
      id: item.id,
      kind: item.kind,
      createdAt: getFeedItemCreatedAt(item),
      sortDate: getHomeSortDate(item),
      rankingScore: getHomeRankingScore(item, baseDate),
      debugSource: item.kind === 'community' ? (item.data.debugSource ?? null) : null,
    })),
  );
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [homeFeedItems, setHomeFeedItems] = useState<FeedItem[]>([]);
  const [communityMap, setCommunityMap] = useState<Record<string, string>>({});
  const [profileMap, setProfileMap] = useState<ProfileMap>({});
  const [likeMap, setLikeMap] = useState<Record<string, { liked: boolean; likes: number }>>({});
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [commentPreviewMap, setCommentPreviewMap] = useState<Record<string, CommentPreview[]>>({});
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { count: number; avatars: string[]; isGoing: boolean }>
  >({});
  const localCommunityFeedEntriesRef = useRef<CommunityFeedSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchFeedItemEngagement = useCallback(
    (
      items: FeedItem[],
      kind: LikeTargetType,
      id: string,
      updates: { likeCount?: number; commentCount?: number },
    ): FeedItem[] =>
      items.map((item) => {
        if (item.kind !== kind || item.id !== id) {
          return item;
        }

        switch (item.kind) {
          case 'post': {
            const likeCount = updates.likeCount ?? item.data.likeCount ?? item.data.likesCount ?? 0;
            const commentCount =
              updates.commentCount ?? item.data.commentCount ?? item.data.commentsCount ?? 0;

            return {
              ...item,
              data: {
                ...item.data,
                likesCount: likeCount,
                commentsCount: commentCount,
                likeCount,
                commentCount,
                engagementCount: likeCount + commentCount,
              },
            };
          }

          case 'news': {
            const likeCount = updates.likeCount ?? item.data.likeCount ?? item.data.likesCount ?? 0;
            const commentCount =
              updates.commentCount ?? item.data.commentCount ?? item.data.commentsCount ?? 0;

            return {
              ...item,
              data: {
                ...item.data,
                likesCount: likeCount,
                commentsCount: commentCount,
                likeCount,
                commentCount,
                engagementCount: likeCount + commentCount,
              },
            };
          }

          case 'event': {
            const likeCount = updates.likeCount ?? item.data.likeCount ?? 0;
            const commentCount = updates.commentCount ?? item.data.commentCount ?? 0;

            return {
              ...item,
              data: {
                ...item.data,
                likeCount,
                commentCount,
                engagementCount: likeCount + commentCount,
              },
            };
          }

          case 'bus_trip': {
            const likeCount = updates.likeCount ?? item.data.likeCount ?? 0;
            const commentCount = updates.commentCount ?? item.data.commentCount ?? 0;

            return {
              ...item,
              data: {
                ...item.data,
                likeCount,
                commentCount,
                engagementCount: likeCount + commentCount,
              },
            };
          }

          case 'match': {
            const likeCount = updates.likeCount ?? item.data.likeCount ?? 0;
            const commentCount = updates.commentCount ?? item.data.commentCount ?? 0;

            return {
              ...item,
              data: {
                ...item.data,
                likeCount,
                commentCount,
                engagementCount: likeCount + commentCount,
              },
            };
          }

          default:
            return item;
        }
      }),
    [],
  );

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    let transformedPosts: Post[] = [];
    let newsItems: NewsItem[] = [];
    let upcomingEvents: Event[] = [];
    let upcomingBusTrips: BusTrip[] = [];
    let homeFanActivities: FanActivity[] = [];
    let communityFeedEntries: CommunityFeedSource[] = [];
    let weeklyTopFanItem: Awaited<ReturnType<typeof fetchLatestPublishedWeeklyTopFan>> = null;

    // Fetch posts in separate try/catch so news_items errors don't block posts
    try {
      const { data: postsData, error: fetchError } = await supabase
        .from('posts')
        .select(
          'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, poll_data',
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      // Fetch author profiles for all posts and keep the current viewer profile available
      // so optimistic post inserts retain display name, avatar, and fan level in Home.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id ?? null;
      const authorIds = [
        ...new Set([...(postsData || []).map((p) => p.author_id), currentUserId].filter(Boolean)),
      ];
      const newProfileMap: Record<string, FeedProfileEntry> = {};

      if (authorIds.length > 0) {
        try {
          const resolvedProfiles = await fetchFeedProfilesByIds(authorIds);
          Object.assign(newProfileMap, resolvedProfiles);
        } catch (e) {
          logger.warn('[FeedProvider] Failed to fetch profiles:', e);
        }
      }

      setProfileMap((prev) => ({
        ...prev,
        ...newProfileMap,
      }));

      // Transform DB posts to Post type with normalized media
      transformedPosts = (postsData || []).map((dbPost) => {
        console.log('[FeedContext] mapped post', {
          id: dbPost.id,
          hasPollData: !!dbPost.poll_data,
          pollData: dbPost.poll_data,
        });

        return withPostAuthorProfile(
          {
            id: dbPost.id,
            authorName: newProfileMap[dbPost.author_id]?.display_name || 'Fan',
            authorId: dbPost.author_id,
            actorType: dbPost.actor_type ?? 'user',
            actorId: dbPost.actor_id ?? dbPost.author_id,
            actorDisplayName:
              dbPost.actor_type === 'community'
                ? null
                : newProfileMap[dbPost.author_id]?.display_name || 'Fan',
            actorAvatarUrl:
              dbPost.actor_type === 'community'
                ? null
                : (newProfileMap[dbPost.author_id]?.avatar_url ?? null),
            communityId: dbPost.community_id ?? null,
            feedTargets: Array.isArray(dbPost.feed_targets) ? dbPost.feed_targets : ['home'],
            createdAt: dbPost.created_at,
            text: dbPost.text,
            poll_data: dbPost.poll_data ?? null,
            likesCount: 0, // TODO: Add likes support
            commentsCount: 0, // TODO: Count comments
            likedByMe: false,
            media: normalizeMedia(dbPost.media), // Normalize media from DB
          },
          newProfileMap[dbPost.author_id],
        );
      });

      setPosts(transformedPosts);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      logger.error('[FeedProvider] fetchPosts (posts) error:', errorMsg);
      // Don't return - continue to try fetching news
    }

    // Fetch news items in separate try/catch
    try {
      newsItems = await fetchNewsItems(50);

      // Build community map from news items and posts
      const communityIds = newsItems
        .filter((item) => item.actorType === 'community' && item.actorId)
        .map((item) => item.actorId);

      const postCommunityIds = transformedPosts
        .map((post) =>
          post.actorType === 'community' ? (post.actorId ?? post.communityId) : post.communityId,
        )
        .filter(Boolean) as string[];

      if (communityIds.length > 0 || postCommunityIds.length > 0) {
        const uniqueCommunityIds = [...new Set([...communityIds, ...postCommunityIds])];
        try {
          const { data: communities, error: commError } = await supabase
            .from('communities')
            .select('id, name, avatar_url, avatar_path')
            .in('id', uniqueCommunityIds);

          if (!commError && communities) {
            const newCommunityMap: Record<string, string> = {};
            const communityIdentityMap = new Map<
              string,
              { name: string; avatarUrl: string | null }
            >();
            communities.forEach((c) => {
              newCommunityMap[c.id] = c.name;
              communityIdentityMap.set(c.id, {
                name: c.name,
                avatarUrl: resolveAvatarUrl(c.avatar_url ?? c.avatar_path ?? null),
              });
            });
            setCommunityMap(newCommunityMap);

            transformedPosts = transformedPosts.map((post) => {
              if (post.actorType !== 'community') {
                return post;
              }

              const communityId = post.actorId ?? post.communityId ?? null;
              const communityIdentity = communityId ? communityIdentityMap.get(communityId) : null;

              if (!communityIdentity) {
                return post;
              }

              return {
                ...post,
                actorDisplayName: communityIdentity.name,
                actorAvatarUrl: communityIdentity.avatarUrl,
                communityName: communityIdentity.name,
              };
            });

            setPosts(transformedPosts);
          }
        } catch (e) {
          logger.warn('[FeedProvider] Failed to fetch community names:', e);
        }
      }
    } catch (e: any) {
      // News fetch failed, but don't block posts
      logger.warn(
        '[FeedProvider] fetchNewsItems failed (will continue with posts only):',
        e?.message || e,
      );
      newsItems = [];
    }

    const persistedCommunityFeedEntries = await fetchHomeCommunityFeedItems(6);
    communityFeedEntries = mergeCommunityFeedEntries(
      localCommunityFeedEntriesRef.current,
      persistedCommunityFeedEntries,
    );

    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.log('[FeedProvider][homeFeed][communitySources]', {
        localCommunityIds: localCommunityFeedEntriesRef.current.map((entry) => entry.community_id),
        persistedCommunityIds: persistedCommunityFeedEntries.map((entry) => entry.community_id),
        mergedCommunityEntries: communityFeedEntries.map((entry) => ({
          communityId: entry.community_id,
          createdAt: entry.created_at,
          debugSource: entry.debug_source ?? null,
        })),
      });
    }

    if (communityFeedEntries.length > 0) {
      const recentCommunityMap: Record<string, string> = {};
      communityFeedEntries.forEach((community) => {
        recentCommunityMap[community.community_id] = community.name;
      });
      setCommunityMap((prev) => ({ ...prev, ...recentCommunityMap }));
    }

    // Fetch event-like Home sources separately from posts/news.
    try {
      const results = await Promise.allSettled([
        fetchEventsUpcoming(20),
        fetchBusTripsUpcoming(20),
        fetchHomeFanActivities(16),
      ]);
      upcomingEvents = results[0].status === 'fulfilled' ? results[0].value : [];
      upcomingBusTrips = results[1].status === 'fulfilled' ? results[1].value : [];
      homeFanActivities = results[2].status === 'fulfilled' ? results[2].value : [];
    } catch (e: any) {
      logger.warn('[FeedProvider] fetchEventsUpcoming/busTrips/fanActivities failed:', e?.message || e);
      upcomingEvents = [];
      upcomingBusTrips = [];
      homeFanActivities = [];
    }

    try {
      weeklyTopFanItem = await fetchLatestPublishedWeeklyTopFan();
      if (weeklyTopFanItem?.userId) {
        setProfileMap((prev) => ({
          ...prev,
          [weeklyTopFanItem!.userId]: {
            display_name: weeklyTopFanItem!.displayName,
            avatar_url: weeklyTopFanItem!.avatarUrl ?? null,
            fan_level_key: weeklyTopFanItem!.fanLevelKey,
          },
        }));
      }
    } catch (e: any) {
      logger.warn('[FeedProvider] fetchLatestPublishedWeeklyTopFan failed:', e?.message || e);
      weeklyTopFanItem = null;
    }

    // Merge posts, news, events, and bus trips into combined feed
    try {
      const safePostsArray = transformedPosts ?? [];
      const safeNewsArray = newsItems ?? [];
      const safeEventsArray = upcomingEvents ?? [];
      const safeBusTripsArray = upcomingBusTrips ?? [];
      const safeFanActivitiesArray = homeFanActivities ?? [];
      const safeCommunityFeedEntries = communityFeedEntries ?? [];
      const safeWeeklyTopFanItem = weeklyTopFanItem ?? null;
      const baseDate = new Date();
      const nextFeedItems = buildFeedItemsFromSources({
        posts: safePostsArray,
        newsItems: safeNewsArray,
        events: safeEventsArray,
        busTrips: safeBusTripsArray,
        weeklyTopFanItem: safeWeeklyTopFanItem,
        baseDate,
      });
      const nextHomeFeedItems = buildHomeFeedItemsFromSources({
        posts: safePostsArray,
        newsItems: safeNewsArray,
        events: safeEventsArray,
        busTrips: safeBusTripsArray,
        communityFeedEntries: safeCommunityFeedEntries,
        fanActivities: safeFanActivitiesArray,
        weeklyTopFanItem: safeWeeklyTopFanItem,
        baseDate,
      });

      setFeedItems(nextFeedItems);
      setHomeFeedItems(nextHomeFeedItems);
      logHomeFeedSnapshot('built', nextHomeFeedItems, baseDate);

      // Fetch like and comment counts for all feed items
      // Note: get_like_state_v2 doesn't support user context, so liked will always be false
      // Individual like state will be fetched when user interacts

      // Group items by kind
      const postIds = safePostsArray.map((p) => p.id);
      const newsIds = safeNewsArray.map((n) => n.id);
      const eventIds = safeEventsArray.map((e) => e.id);
      const busTripIds = safeBusTripsArray.map((b) => b.id);

      // Fetch likes, comments, and previews for each kind in parallel
      // Wrap each in try-catch to ensure we get Maps even if individual fetch fails
      const [
        postLikes,
        postComments,
        postPreviews,
        newsLikes,
        newsComments,
        newsPreviews,
        eventLikes,
        eventComments,
        eventPreviews,
        busTripLikes,
        busTripComments,
        busTripPreviews,
      ] = await Promise.all([
        fetchLikeStates('post', postIds).catch((err) => {
          logger.warn('[FeedProvider] postLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('post', postIds).catch((err) => {
          logger.warn('[FeedProvider] postComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('post', postIds).catch((err) => {
          logger.warn('[FeedProvider] postPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('news', newsIds).catch((err) => {
          logger.warn('[FeedProvider] newsLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('news', newsIds).catch((err) => {
          logger.warn('[FeedProvider] newsComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('news', newsIds).catch((err) => {
          logger.warn('[FeedProvider] newsPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('event', eventIds).catch((err) => {
          logger.warn('[FeedProvider] eventLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('event', eventIds).catch((err) => {
          logger.warn('[FeedProvider] eventComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('event', eventIds).catch((err) => {
          logger.warn('[FeedProvider] eventPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('bus_trip', busTripIds).catch((err) => {
          logger.warn('[FeedProvider] busTripLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('bus_trip', busTripIds).catch((err) => {
          logger.warn('[FeedProvider] busTripComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('bus_trip', busTripIds).catch((err) => {
          logger.warn('[FeedProvider] busTripPreviews failed:', err);
          return new Map();
        }),
      ]);

      // Ensure all Maps are valid (in case catch returns undefined)
      const safePostLikes = postLikes || new Map();
      const safePostComments = postComments || new Map();
      const safePostPreviews = postPreviews || new Map();
      const safeNewsLikes = newsLikes || new Map();
      const safeNewsComments = newsComments || new Map();
      const safeNewsPreviews = newsPreviews || new Map();
      const safeEventLikes = eventLikes || new Map();
      const safeEventComments = eventComments || new Map();
      const safeEventPreviews = eventPreviews || new Map();
      const safeBusTripLikes = busTripLikes || new Map();
      const safeBusTripComments = busTripComments || new Map();
      const safeBusTripPreviews = busTripPreviews || new Map();

      // Build maps with "${kind}:${id}" keys
      const newLikeMap: Record<string, { liked: boolean; likes: number }> = {};
      const newCommentCountMap: Record<string, number> = {};
      const newCommentPreviewMap: Record<string, CommentPreview[]> = {};

      postIds.forEach((id) => {
        const key = targetKey('post', id);
        newLikeMap[key] = safePostLikes.get(id) || { liked: false, likes: 0 };
        newCommentCountMap[key] = safePostComments.get(id) || 0;
        newCommentPreviewMap[key] = safePostPreviews.get(id) || [];
      });

      newsIds.forEach((id) => {
        const key = targetKey('news', id);
        newLikeMap[key] = safeNewsLikes.get(id) || { liked: false, likes: 0 };
        newCommentCountMap[key] = safeNewsComments.get(id) || 0;
        newCommentPreviewMap[key] = safeNewsPreviews.get(id) || [];
      });

      eventIds.forEach((id) => {
        const key = targetKey('event', id);
        newLikeMap[key] = safeEventLikes.get(id) || { liked: false, likes: 0 };
        newCommentCountMap[key] = safeEventComments.get(id) || 0;
        newCommentPreviewMap[key] = safeEventPreviews.get(id) || [];
      });

      busTripIds.forEach((id) => {
        const key = targetKey('bus_trip', id);
        newLikeMap[key] = safeBusTripLikes.get(id) || { liked: false, likes: 0 };
        newCommentCountMap[key] = safeBusTripComments.get(id) || 0;
        newCommentPreviewMap[key] = safeBusTripPreviews.get(id) || [];
      });

      setLikeMap(newLikeMap);
      setFeedItems(withFeedEngagementSummary(nextFeedItems, newLikeMap, newCommentCountMap));
      const rankedHomeFeedItems = sortHomeFeedItems(
        withFeedEngagementSummary(nextHomeFeedItems, newLikeMap, newCommentCountMap),
        baseDate,
      );
      setHomeFeedItems(rankedHomeFeedItems);
      logHomeFeedSnapshot('final', rankedHomeFeedItems, baseDate);

      // ── Rehydrate likedByMe from likes_v2 for current user ──
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id;
        if (currentUserId) {
          const [myPostLikes, myNewsLikes, myEventLikes, myBusTripLikes] = await Promise.all([
            fetchMyLikedIds(currentUserId, 'post', postIds).catch(() => new Set<string>()),
            fetchMyLikedIds(currentUserId, 'news', newsIds).catch(() => new Set<string>()),
            fetchMyLikedIds(currentUserId, 'event', eventIds).catch(() => new Set<string>()),
            fetchMyLikedIds(currentUserId, 'bus_trip', busTripIds).catch(() => new Set<string>()),
          ]);

          const patchedLikeMap = { ...newLikeMap };
          const patchLiked = (kind: LikeTargetType, ids: string[], mySet: Set<string>) => {
            for (const id of ids) {
              if (mySet.has(id)) {
                const key = targetKey(kind, id);
                patchedLikeMap[key] = { ...patchedLikeMap[key], liked: true };
              }
            }
          };
          patchLiked('post', postIds, myPostLikes);
          patchLiked('news', newsIds, myNewsLikes);
          patchLiked('event', eventIds, myEventLikes);
          patchLiked('bus_trip', busTripIds, myBusTripLikes);

          setLikeMap(patchedLikeMap);
        }
      } catch (e) {
        logger.warn('[FeedProvider] likedByMe rehydration failed:', e);
      }

      // ── Batch fetch attendance for events and bus trips ──
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id;

        const allAttendableIds = [...eventIds, ...busTripIds];
        if (allAttendableIds.length > 0) {
          // Fetch all RSVPs for events & bus trips
          const { data: rsvps, error: rsvpError } = await supabase
            .from('rsvps')
            .select('entity_type, entity_id, user_id, profiles:user_id(avatar_url)')
            .in('entity_id', allAttendableIds)
            .in('entity_type', ['event', 'bus_trip'])
            .eq('status', 'going');

          if (!rsvpError && rsvps) {
            // Aggregate by entity_id
            const attendanceByEntity: Record<
              string,
              { count: number; avatars: string[]; isGoing: boolean }
            > = {};

            rsvps.forEach((rsvp: any) => {
              const entityId = rsvp.entity_id;
              if (!attendanceByEntity[entityId]) {
                attendanceByEntity[entityId] = { count: 0, avatars: [], isGoing: false };
              }
              attendanceByEntity[entityId].count += 1;
              // Extract avatar_url from joined profiles
              const avatarUrl = rsvp.profiles?.avatar_url;
              if (avatarUrl && attendanceByEntity[entityId].avatars.length < 5) {
                attendanceByEntity[entityId].avatars.push(avatarUrl);
              }
              // Check if current user is going
              if (currentUserId && rsvp.user_id === currentUserId) {
                attendanceByEntity[entityId].isGoing = true;
              }
            });

            setAttendanceMap(attendanceByEntity);
          } else {
            logger.warn('[FeedProvider] Attendance fetch failed:', rsvpError);
          }
        }
      } catch (e) {
        logger.warn('[FeedProvider] Attendance fetch error:', e);
      }

      setCommentCountMap(newCommentCountMap);
      setCommentPreviewMap(newCommentPreviewMap);
    } catch (e: any) {
      logger.error('[FeedProvider] Error merging feed:', e?.message || e);
    }

    setLoading(false);
  }, []);

  const addPost = useCallback(
    (post: Post) => {
      // Dedupe: if post with same ID exists, replace it; otherwise prepend
      const nextPost = withPostAuthorProfile(
        post,
        post.authorId ? profileMap[post.authorId] : null,
      );

      setPosts((prev) => {
        const existingIndex = prev.findIndex((p) => p.id === nextPost.id);
        if (existingIndex >= 0) {
          // Replace existing post
          const updated = [...prev];
          updated[existingIndex] = nextPost;
          return updated;
        }
        // Prepend new post
        return [nextPost, ...prev];
      });

      // Also update feedItems
      setFeedItems((prev) => {
        const feedPost = toPostFeedItem(nextPost);
        const existingIndex = prev.findIndex((item) => item.id === nextPost.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = feedPost;
          return sortFeedItemsByDate(updated);
        }
        // Prepend and re-sort
        const updated = [feedPost, ...prev];
        return sortFeedItemsByDate(updated);
      });

      setHomeFeedItems((prev) => {
        if (!isHomePost(nextPost)) {
          return prev.filter((item) => !(item.kind === 'post' && item.id === nextPost.id));
        }

        const feedPost = toPostFeedItem(nextPost);
        const existingIndex = prev.findIndex((item) => item.id === nextPost.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = feedPost;
          return sortHomeFeedItems(updated);
        }

        return sortHomeFeedItems([feedPost, ...prev]);
      });
    },
    [profileMap],
  );

  const addCommunityFeedItem = useCallback((community: CommunityFeedSource) => {
    const nextCommunityEntry: CommunityFeedSource = {
      ...community,
      debug_source: community.debug_source ?? 'local',
    };

    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.log('[FeedProvider][homeFeed][addCommunityFeedItem]', {
        communityId: nextCommunityEntry.community_id,
        createdAt: nextCommunityEntry.created_at,
        debugSource: nextCommunityEntry.debug_source ?? null,
      });
    }

    localCommunityFeedEntriesRef.current = [
      nextCommunityEntry,
      ...localCommunityFeedEntriesRef.current.filter(
        (entry) => entry.community_id !== nextCommunityEntry.community_id,
      ),
    ];

    setCommunityMap((prev) => ({
      ...prev,
      [nextCommunityEntry.community_id]: nextCommunityEntry.name,
    }));

    setHomeFeedItems((prev) => {
      const feedCommunity = toCommunityFeedItem(nextCommunityEntry);
      const filtered = prev.filter(
        (item) =>
          !(item.kind === 'community' && item.data.communityId === nextCommunityEntry.community_id),
      );
      return sortHomeFeedItems([feedCommunity, ...filtered]);
    });
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setFeedItems((prev) => prev.filter((item) => item.id !== postId));
    setHomeFeedItems((prev) => prev.filter((item) => item.id !== postId));
  }, []);

  const removeNews = useCallback((newsId: string) => {
    setFeedItems((prev) => prev.filter((item) => !(item.kind === 'news' && item.id === newsId)));
    setHomeFeedItems((prev) =>
      prev.filter((item) => !(item.kind === 'news' && item.id === newsId)),
    );
  }, []);

  const hydratePostEngagement = useCallback(
    ({
      postId,
      liked,
      likes,
      commentsCount,
      commentPreviews,
    }: {
      postId: string;
      liked: boolean;
      likes: number;
      commentsCount: number;
      commentPreviews: CommentPreview[];
    }) => {
      const key = targetKey('post', postId);

      setLikeMap((prev) => {
        if (prev[key]) {
          return prev;
        }

        return {
          ...prev,
          [key]: { liked, likes },
        };
      });

      setCommentCountMap((prev) => {
        if (typeof prev[key] === 'number') {
          return prev;
        }

        return {
          ...prev,
          [key]: commentsCount,
        };
      });

      setCommentPreviewMap((prev) => {
        if (prev[key]) {
          return prev;
        }

        return {
          ...prev,
          [key]: commentPreviews,
        };
      });
    },
    [],
  );

  const toggleLike = useCallback(
    async (kind: LikeTargetType, id: string, userId: string) => {
      const key = targetKey(kind, id);
      const currentState = likeMap[key] || { liked: false, likes: 0 };

      // Optimistic update
      const newLiked = !currentState.liked;
      const newLikes = newLiked ? currentState.likes + 1 : Math.max(0, currentState.likes - 1);

      setLikeMap((prev) => ({
        ...prev,
        [key]: { liked: newLiked, likes: newLikes },
      }));
      setFeedItems((prev) => patchFeedItemEngagement(prev, kind, id, { likeCount: newLikes }));
      setHomeFeedItems((prev) =>
        sortHomeFeedItems(patchFeedItemEngagement(prev, kind, id, { likeCount: newLikes })),
      );

      // Persist to DB
      try {
        const success = await toggleLikeApi(kind, id, userId, currentState.liked);
        if (!success) {
          logger.warn('[toggleLike failed]', { targetType: kind, targetId: id, error: 'unknown' });
          // Revert on failure
          setLikeMap((prev) => ({
            ...prev,
            [key]: currentState,
          }));
          setFeedItems((prev) =>
            patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
          );
          setHomeFeedItems((prev) =>
            sortHomeFeedItems(
              patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
            ),
          );
          return;
        }
        logger.log('[toggleLike ok]', { targetType: kind, targetId: id });
      } catch (error) {
        logger.warn('[toggleLike failed]', { targetType: kind, targetId: id, error });
        // Revert on failure
        setLikeMap((prev) => ({
          ...prev,
          [key]: currentState,
        }));
        setFeedItems((prev) =>
          patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
        );
        setHomeFeedItems((prev) =>
          sortHomeFeedItems(
            patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
          ),
        );
      }
    },
    [likeMap, patchFeedItemEngagement],
  );

  const incrementCommentCount = useCallback(
    (kind: LikeTargetType, id: string) => {
      const key = targetKey(kind, id);
      const nextCommentCount = (commentCountMap[key] || 0) + 1;
      setCommentCountMap((prev) => ({
        ...prev,
        [key]: nextCommentCount,
      }));
      setFeedItems((prev) =>
        patchFeedItemEngagement(prev, kind, id, { commentCount: nextCommentCount }),
      );
      setHomeFeedItems((prev) =>
        sortHomeFeedItems(
          patchFeedItemEngagement(prev, kind, id, { commentCount: nextCommentCount }),
        ),
      );
    },
    [commentCountMap, patchFeedItemEngagement],
  );

  const addCommentPreview = useCallback(
    (kind: LikeTargetType, id: string, comment: CommentPreview) => {
      const key = targetKey(kind, id);
      setCommentPreviewMap((prev) => {
        const existing = prev[key] || [];
        // Prepend new comment and keep only latest 2
        const updated = [comment, ...existing].slice(0, 2);
        return {
          ...prev,
          [key]: updated,
        };
      });
    },
    [],
  );

  return (
    <FeedContext.Provider
      value={{
        posts,
        feedItems,
        homeFeedItems,
        communityMap,
        profileMap,
        likeMap,
        commentCountMap,
        commentPreviewMap,
        attendanceMap,
        addPost,
        addCommunityFeedItem,
        removePost,
        removeNews,
        fetchPosts,
        hydratePostEngagement,
        toggleLike,
        incrementCommentCount,
        addCommentPreview,
        loading,
        error,
      }}
    >
      {children}
    </FeedContext.Provider>
  );
}

export function useFeed() {
  const context = React.useContext(FeedContext);
  if (!context) {
    throw new Error('useFeed must be used within FeedProvider');
  }
  return context;
}
