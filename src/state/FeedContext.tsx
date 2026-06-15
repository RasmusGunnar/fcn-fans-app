import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
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
import { normalizePostType, type Post } from '../types/post';
import {
  buildFeedItemsFromSources,
  buildHomeFeedItemsFromSources,
  getFeedItemCreatedAt,
  getHomeRankingScore,
  getHomeSortDate,
  HOME_FEED_AUDIT_DEBUG_ENABLED,
  isHomePost,
  reconcileFeedItemIdentities,
  sortFeedItemsByDate,
  sortHomeFeedItems,
  toCommunityFeedItem,
  toPostFeedItem,
  withFeedEngagementSummary,
  withFeedEngagementSummaryPreservingList,
} from '../utils/homeFeed';
import { resolveAvatarUrl } from '../utils/avatar';
import { normalizeLinkPreview } from '../utils/linkPreview';
import { normalizeMedia } from '../utils/media';
import { logPerformanceTiming, performanceNow } from '../utils/performanceTiming';
import { POST_ENGAGEMENT_TARGET_TYPE } from '../utils/postEngagement';
import { targetKey } from '../utils/targetKey';

type FeedProfileEntry = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  fan_level_key: FanLevelKey | null;
};

type EngagementCounts = {
  likeMap: Record<string, { liked: boolean; likes: number }>;
  commentCountMap: Record<string, number>;
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

function mergeFetchedLikeMapPreservingLikedState(
  previousLikeMap: Record<string, { liked: boolean; likes: number }>,
  fetchedLikeMap: Record<string, { liked: boolean; likes: number }>,
): Record<string, { liked: boolean; likes: number }> {
  const mergedLikeMap = { ...previousLikeMap };
  let changed = false;

  Object.entries(fetchedLikeMap).forEach(([key, fetchedState]) => {
    const previousState = previousLikeMap[key];
    if (!previousState && fetchedState.liked !== true && fetchedState.likes === 0) {
      return;
    }

    const shouldPreserveLikedTrue = previousState?.liked === true && fetchedState.liked !== true;
    const nextState = {
      liked: shouldPreserveLikedTrue ? true : fetchedState.liked,
      likes: shouldPreserveLikedTrue
        ? Math.max(previousState?.likes ?? 0, fetchedState.likes)
        : fetchedState.likes,
    };

    if (
      !previousState ||
      previousState.liked !== nextState.liked ||
      previousState.likes !== nextState.likes
    ) {
      changed = true;
      mergedLikeMap[key] = nextState;
    }
  });

  return changed ? mergedLikeMap : previousLikeMap;
}

function mergeCommentCountMaps(
  previousMap: Record<string, number>,
  fetchedMap: Record<string, number>,
): Record<string, number> {
  let nextMap = previousMap;

  Object.entries(fetchedMap).forEach(([key, count]) => {
    if (!(key in previousMap) && count === 0) {
      return;
    }

    if (previousMap[key] === count) {
      return;
    }

    if (nextMap === previousMap) {
      nextMap = { ...previousMap };
    }
    nextMap[key] = count;
  });

  return nextMap;
}

function mergeCommunityNames(
  previousMap: Record<string, string>,
  fetchedMap: Record<string, string>,
): Record<string, string> {
  let nextMap = previousMap;

  Object.entries(fetchedMap).forEach(([communityId, name]) => {
    if (previousMap[communityId] === name) {
      return;
    }

    if (nextMap === previousMap) {
      nextMap = { ...previousMap };
    }
    nextMap[communityId] = name;
  });

  return nextMap;
}

function mergeProfileEntries(
  previousMap: Record<string, FeedProfileEntry>,
  fetchedMap: Record<string, FeedProfileEntry>,
): Record<string, FeedProfileEntry> {
  let nextMap = previousMap;

  Object.entries(fetchedMap).forEach(([userId, profile]) => {
    const previousProfile = previousMap[userId];
    if (
      previousProfile?.display_name === profile.display_name &&
      previousProfile?.username === profile.username &&
      previousProfile?.avatar_url === profile.avatar_url &&
      previousProfile?.fan_level_key === profile.fan_level_key
    ) {
      return;
    }

    if (nextMap === previousMap) {
      nextMap = { ...previousMap };
    }
    nextMap[userId] = profile;
  });

  return nextMap;
}

function areCommentPreviewsEqual(
  previous: CommentPreview[] | undefined,
  next: CommentPreview[],
): boolean {
  if (previous === next) {
    return true;
  }
  if (!previous || previous.length !== next.length) {
    return false;
  }

  return previous.every(
    (comment, index) =>
      comment.id === next[index]?.id &&
      comment.text === next[index]?.text &&
      comment.created_at === next[index]?.created_at &&
      comment.author_display_name === next[index]?.author_display_name &&
      comment.author_avatar_url === next[index]?.author_avatar_url,
  );
}

function mergeCommentPreviewMaps(
  previousMap: Record<string, CommentPreview[]>,
  fetchedMap: Record<string, CommentPreview[]>,
): Record<string, CommentPreview[]> {
  let nextMap = previousMap;

  Object.entries(fetchedMap).forEach(([key, previews]) => {
    const previousPreviews = previousMap[key];
    if (
      (!previousPreviews && previews.length === 0) ||
      areCommentPreviewsEqual(previousPreviews, previews)
    ) {
      return;
    }

    if (nextMap === previousMap) {
      nextMap = { ...previousMap };
    }
    nextMap[key] = previews;
  });

  return nextMap;
}

async function fetchEngagementCounts(
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<EngagementCounts> {
  const [likes, comments] = await Promise.all([
    fetchLikeStates(targetType, targetIds).catch((error) => {
      logger.warn(`[FeedProvider] ${targetType} likes failed:`, error);
      return new Map<string, { liked: boolean; likes: number }>();
    }),
    fetchCommentCounts(targetType, targetIds).catch((error) => {
      logger.warn(`[FeedProvider] ${targetType} comment counts failed:`, error);
      return new Map<string, number>();
    }),
  ]);
  const likeMap: EngagementCounts['likeMap'] = {};
  const commentCountMap: EngagementCounts['commentCountMap'] = {};

  targetIds.forEach((id) => {
    const key = targetKey(targetType, id);
    likeMap[key] = likes.get(id) ?? { liked: false, likes: 0 };
    commentCountMap[key] = comments.get(id) ?? 0;
  });

  return { likeMap, commentCountMap };
}

async function fetchEngagementPreviews(
  targetType: LikeTargetType,
  targetIds: string[],
): Promise<Record<string, CommentPreview[]>> {
  const previews = await fetchCommentPreviews(targetType, targetIds).catch((error) => {
    logger.warn(`[FeedProvider] ${targetType} comment previews failed:`, error);
    return new Map<string, CommentPreview[]>();
  });
  const previewMap: Record<string, CommentPreview[]> = {};

  targetIds.forEach((id) => {
    previewMap[targetKey(targetType, id)] = previews.get(id) ?? [];
  });

  return previewMap;
}

async function waitForSecondaryFeedWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 100);
    InteractionManager.runAfterInteractions(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function loadSecondarySource<T>(
  stage: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const startedAt = performanceNow();
  try {
    const result = await loader();
    logPerformanceTiming('FeedFetch', stage, startedAt);
    return result;
  } catch (error) {
    if (stage !== 'secondary-weekly-top-fan' || HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.warn(`[FeedProvider] ${stage} failed:`, error);
    }
    logPerformanceTiming('FeedFetch', `${stage}-error`, startedAt);
    return fallback;
  }
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
  const providerRenderStartedAt = performanceNow();
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [homeFeedItems, setHomeFeedItems] = useState<FeedItem[]>([]);
  const [communityMap, setCommunityMap] = useState<Record<string, string>>({});
  const [profileMap, setProfileMap] = useState<Record<string, FeedProfileEntry>>({});
  const [likeMap, setLikeMap] = useState<Record<string, { liked: boolean; likes: number }>>({});
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [commentPreviewMap, setCommentPreviewMap] = useState<Record<string, CommentPreview[]>>({});
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { count: number; avatars: string[]; isGoing: boolean }>
  >({});
  const localCommunityFeedEntriesRef = useRef<CommunityFeedSource[]>([]);
  const likeMapRef = useRef<Record<string, { liked: boolean; likes: number }>>({});
  const commentCountMapRef = useRef<Record<string, number>>({});
  const fetchRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    likeMapRef.current = likeMap;
  }, [likeMap]);

  useEffect(() => {
    commentCountMapRef.current = commentCountMap;
  }, [commentCountMap]);

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
    const fetchStartedAt = performanceNow();
    const requestId = ++fetchRequestIdRef.current;
    const isCurrentRequest = () => fetchRequestIdRef.current === requestId;

    setLoading(true);
    setError(null);

    let transformedPosts: Post[] = [];
    let newsItems: NewsItem[] = [];
    let upcomingEvents: Event[] = [];
    let upcomingBusTrips: BusTrip[] = [];
    let homeFanActivities: FanActivity[] = [];
    let communityFeedEntries: CommunityFeedSource[] = [];
    let weeklyTopFanItem: Awaited<ReturnType<typeof fetchLatestPublishedWeeklyTopFan>> = null;
    let refreshedProfileMap: Record<string, FeedProfileEntry> = {};
    let currentUserId: string | null = null;
    const baseDate = new Date();
    let postEngagementCountsTask: Promise<void> = Promise.resolve();
    let profileHydrationTask: Promise<void> = Promise.resolve();

    const publishEngagementCounts = (counts: EngagementCounts, rerankHome: boolean) => {
      if (!isCurrentRequest()) {
        return;
      }

      const publicationStartedAt = performanceNow();
      const mergedLikeMap = mergeFetchedLikeMapPreservingLikedState(
        likeMapRef.current,
        counts.likeMap,
      );
      const mergedCommentCountMap = mergeCommentCountMaps(
        commentCountMapRef.current,
        counts.commentCountMap,
      );

      likeMapRef.current = mergedLikeMap;
      commentCountMapRef.current = mergedCommentCountMap;
      setLikeMap(mergedLikeMap);
      setCommentCountMap(mergedCommentCountMap);
      setFeedItems((previousItems) =>
        withFeedEngagementSummaryPreservingList(
          previousItems,
          mergedLikeMap,
          mergedCommentCountMap,
        ),
      );
      setHomeFeedItems((previousItems) => {
        const summarizedItems = withFeedEngagementSummaryPreservingList(
          previousItems,
          mergedLikeMap,
          mergedCommentCountMap,
        );
        const nextItems = rerankHome
          ? sortHomeFeedItems(summarizedItems, baseDate)
          : summarizedItems;
        return reconcileFeedItemIdentities(previousItems, nextItems);
      });
      logPerformanceTiming('FeedPublication', 'engagement-state-enqueued', publicationStartedAt, {
        likeCount: Object.keys(mergedLikeMap).length,
        commentCount: Object.keys(mergedCommentCountMap).length,
        rerankHome,
      });
    };

    const publishCommentPreviews = (previews: Record<string, CommentPreview[]>) => {
      if (!isCurrentRequest()) {
        return;
      }

      const publicationStartedAt = performanceNow();
      setCommentPreviewMap((previousMap) => mergeCommentPreviewMaps(previousMap, previews));
      logPerformanceTiming('FeedPublication', 'comment-previews-enqueued', publicationStartedAt, {
        targetCount: Object.keys(previews).length,
      });
    };

    const authStartedAt = performanceNow();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      currentUserId = session?.user?.id ?? null;
    } catch (authError) {
      logger.warn('[FeedProvider] Failed to read current session:', authError);
    }
    logPerformanceTiming('FeedFetch', 'session', authStartedAt, {
      hasSession: Boolean(currentUserId),
    });

    // Fetch posts in separate try/catch so news_items errors don't block posts
    try {
      const postsFetchStartedAt = performanceNow();
      const { data: postsData, error: fetchError } = await supabase
        .from('posts')
        .select(
          'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, poll_data, link_preview, post_type',
        )
        .order('created_at', { ascending: false })
        .limit(25);

      if (fetchError) {
        throw fetchError;
      }
      logPerformanceTiming('FeedFetch', 'posts', postsFetchStartedAt, {
        postCount: postsData?.length ?? 0,
      });

      // Publish post rows before profile hydration so Home can render and calculate
      // viewability while author metadata loads in the background.
      const mappingStartedAt = performanceNow();
      transformedPosts = (postsData || []).map((dbPost) => ({
        id: dbPost.id,
        postType: normalizePostType(dbPost.post_type),
        authorName: 'Fan',
        authorId: dbPost.author_id,
        actorType: dbPost.actor_type ?? 'user',
        actorId: dbPost.actor_id ?? dbPost.author_id,
        actorDisplayName: dbPost.actor_type === 'community' ? null : 'Fan',
        actorAvatarUrl: null,
        communityId: dbPost.community_id ?? null,
        feedTargets: Array.isArray(dbPost.feed_targets) ? dbPost.feed_targets : ['home'],
        createdAt: dbPost.created_at,
        text: dbPost.text,
        poll_data: dbPost.poll_data ?? null,
        linkPreview: normalizeLinkPreview(dbPost.link_preview),
        likesCount: 0,
        commentsCount: 0,
        likedByMe: false,
        media: normalizeMedia(dbPost.media),
      }));
      logPerformanceTiming('FeedMap', 'posts', mappingStartedAt, {
        postCount: transformedPosts.length,
        mediaArticleCount: transformedPosts.filter(
          (post) => post.postType === 'media_article',
        ).length,
      });
      logPerformanceTiming('FeedMap', 'media-preparation', mappingStartedAt, {
        attachmentCount: transformedPosts.reduce(
          (count, post) => count + (post.media?.length ?? 0),
          0,
        ),
        mode: 'metadata-only',
        eagerMediaUrlResolutionCount: 0,
        eagerMediaPrefetchCount: 0,
        eagerFaviconRequestCount: 0,
      });

      if (!isCurrentRequest()) {
        return;
      }

      const postsOnlyFeedItems = buildFeedItemsFromSources({
        posts: transformedPosts,
        newsItems: [],
        events: [],
        busTrips: [],
        weeklyTopFanItem: null,
        baseDate,
      });
      const postsOnlyHomeItems = sortHomeFeedItems(
        buildHomeFeedItemsFromSources({
          posts: transformedPosts,
          newsItems: [],
          events: [],
          busTrips: [],
          weeklyTopFanItem: null,
          baseDate,
        }),
        baseDate,
      );
      const publicationStartedAt = performanceNow();
      setPosts(transformedPosts);
      setFeedItems(postsOnlyFeedItems);
      setHomeFeedItems(postsOnlyHomeItems);
      setLoading(false);
      logPerformanceTiming('FeedPublication', 'posts-only-enqueued', publicationStartedAt, {
        postCount: transformedPosts.length,
        feedItemCount: postsOnlyFeedItems.length,
        homeItemCount: postsOnlyHomeItems.length,
      });
      logPerformanceTiming('FeedItemsReady', 'posts-published', fetchStartedAt, {
        itemCount: postsOnlyHomeItems.length,
        profileHydrationPending: true,
        secondaryFeedPending: true,
      });

      const postIds = transformedPosts.map((post) => post.id);
      const postEngagementStartedAt = performanceNow();
      postEngagementCountsTask = fetchEngagementCounts(
        POST_ENGAGEMENT_TARGET_TYPE,
        postIds,
      ).then((counts) => {
        publishEngagementCounts(counts, false);
        logPerformanceTiming('FeedFetch', 'post-engagement-counts', postEngagementStartedAt, {
          targetCount: postIds.length,
        });
      });

      // Fetch author profiles for all posts and keep the current viewer profile available
      // so optimistic post inserts retain display name, avatar, and fan level in Home.
      const authorIds = [
        ...new Set([...(postsData || []).map((p) => p.author_id), currentUserId].filter(Boolean)),
      ];
      profileHydrationTask = (async () => {
        const newProfileMap: Record<string, FeedProfileEntry> = {};
        const profilesStartedAt = performanceNow();
        if (authorIds.length > 0) {
          try {
            const resolvedProfiles = await fetchFeedProfilesByIds(authorIds);
            Object.assign(newProfileMap, resolvedProfiles);
          } catch (e) {
            logger.warn('[FeedProvider] Failed to fetch profiles:', e);
          }
        }
        logPerformanceTiming('FeedFetch', 'profiles', profilesStartedAt, {
          requestedCount: authorIds.length,
          resolvedCount: Object.keys(newProfileMap).length,
        });
        refreshedProfileMap = newProfileMap;

        if (!isCurrentRequest()) {
          return;
        }

        const publicationStartedAt = performanceNow();
        setProfileMap((prev) => mergeProfileEntries(prev, newProfileMap));
        logPerformanceTiming('FeedPublication', 'profiles-enqueued', publicationStartedAt, {
          profileCount: Object.keys(newProfileMap).length,
        });
        logPerformanceTiming('FeedFetch', 'profiles-applied', fetchStartedAt, {
          itemCount: postsOnlyHomeItems.length,
        });
      })();
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      logger.error('[FeedProvider] fetchPosts (posts) error:', errorMsg);
      // Don't return - continue to try fetching news
    }

    const secondaryDeferredAt = performanceNow();
    await waitForSecondaryFeedWork();
    if (!isCurrentRequest()) {
      return;
    }
    logPerformanceTiming('FeedFetch', 'secondary-work-started', secondaryDeferredAt);

    const newsItemsTask = loadSecondarySource('secondary-news', () => fetchNewsItems(25), []);
    const persistedCommunityFeedTask = loadSecondarySource(
      'secondary-communities',
      () => fetchHomeCommunityFeedItems(6),
      [],
    );
    const upcomingEventsTask = loadSecondarySource(
      'secondary-events',
      () => fetchEventsUpcoming(10),
      [],
    );
    const upcomingBusTripsTask = loadSecondarySource(
      'secondary-bus-trips',
      () => fetchBusTripsUpcoming(10),
      [],
    );
    const homeFanActivitiesTask = loadSecondarySource(
      'secondary-fan-activities',
      () => fetchHomeFanActivities(8),
      [],
    );
    const weeklyTopFanTask = loadSecondarySource(
      'secondary-weekly-top-fan',
      () => fetchLatestPublishedWeeklyTopFan(baseDate),
      null,
    );

    // Publish the primary mixed sources as soon as they are ready. Slower discovery
    // cards and weekly-top-fan enrichment continue in the background.
    [newsItems, upcomingEvents, upcomingBusTrips] = await Promise.all([
      newsItemsTask,
      upcomingEventsTask,
      upcomingBusTripsTask,
    ]);
    if (!isCurrentRequest()) {
      return;
    }

    const coreBuildStartedAt = performanceNow();
    const coreFeedItems = withFeedEngagementSummary(
      buildFeedItemsFromSources({
        posts: transformedPosts,
        newsItems,
        events: upcomingEvents,
        busTrips: upcomingBusTrips,
        weeklyTopFanItem: null,
        baseDate,
      }),
      likeMapRef.current,
      commentCountMapRef.current,
    );
    const coreHomeFeedItems = sortHomeFeedItems(
      withFeedEngagementSummary(
        buildHomeFeedItemsFromSources({
          posts: transformedPosts,
          newsItems,
          events: upcomingEvents,
          busTrips: upcomingBusTrips,
          weeklyTopFanItem: null,
          baseDate,
        }),
        likeMapRef.current,
        commentCountMapRef.current,
      ),
      baseDate,
    );
    const corePublicationStartedAt = performanceNow();
    setFeedItems((previousItems) =>
      reconcileFeedItemIdentities(previousItems, coreFeedItems),
    );
    setHomeFeedItems((previousItems) =>
      reconcileFeedItemIdentities(previousItems, coreHomeFeedItems),
    );
    logPerformanceTiming('FeedPublication', 'mixed-core-enqueued', corePublicationStartedAt, {
      feedItemCount: coreFeedItems.length,
      homeItemCount: coreHomeFeedItems.length,
    });
    logPerformanceTiming('FeedMap', 'secondary-core-build', coreBuildStartedAt, {
      feedItemCount: coreFeedItems.length,
      homeItemCount: coreHomeFeedItems.length,
    });
    logPerformanceTiming('FeedFetch', 'mixed-feed-built', fetchStartedAt, {
      feedItemCount: coreFeedItems.length,
      homeItemCount: coreHomeFeedItems.length,
      sourceMode: 'core-first',
      lowPriorityPending: true,
    });
    logPerformanceTiming('FeedItemsReady', 'mixed-feed-published', fetchStartedAt, {
      feedItemCount: coreFeedItems.length,
      homeItemCount: coreHomeFeedItems.length,
      engagementPending: true,
      lowPriorityPending: true,
    });
    logHomeFeedSnapshot('core', coreHomeFeedItems, baseDate);

    const corePostIds = transformedPosts.map((post) => post.id);
    const coreNewsIds = newsItems.map((newsItem) => newsItem.id);
    const coreEventIds = upcomingEvents.map((event) => event.id);
    const coreBusTripIds = upcomingBusTrips.map((busTrip) => busTrip.id);
    let secondaryEngagementComplete = false;
    const secondaryEngagementTask = (async () => {
      const engagementStartedAt = performanceNow();
      const [newsEngagement, eventEngagement, busTripEngagement] = await Promise.all([
        fetchEngagementCounts('news', coreNewsIds),
        fetchEngagementCounts('event', coreEventIds),
        fetchEngagementCounts('bus_trip', coreBusTripIds),
      ]);
      publishEngagementCounts(
        {
          likeMap: {
            ...newsEngagement.likeMap,
            ...eventEngagement.likeMap,
            ...busTripEngagement.likeMap,
          },
          commentCountMap: {
            ...newsEngagement.commentCountMap,
            ...eventEngagement.commentCountMap,
            ...busTripEngagement.commentCountMap,
          },
        },
        true,
      );
      logPerformanceTiming('FeedFetch', 'engagement', engagementStartedAt, {
        targetCount: coreNewsIds.length + coreEventIds.length + coreBusTripIds.length,
        mode: 'progressive-counts',
      });
      secondaryEngagementComplete = true;
    })();
    const secondaryPreviewsTask = (async () => {
      await waitForSecondaryFeedWork();
      const previewsStartedAt = performanceNow();
      const previewMaps = await Promise.all([
        fetchEngagementPreviews(POST_ENGAGEMENT_TARGET_TYPE, corePostIds),
        fetchEngagementPreviews('news', coreNewsIds),
        fetchEngagementPreviews('event', coreEventIds),
        fetchEngagementPreviews('bus_trip', coreBusTripIds),
      ]);
      publishCommentPreviews(Object.assign({}, ...previewMaps));
      logPerformanceTiming('FeedFetch', 'engagement-previews', previewsStartedAt, {
        targetCount:
          corePostIds.length +
          coreNewsIds.length +
          coreEventIds.length +
          coreBusTripIds.length,
        blocksMixedFeedPublication: false,
      });
    })();

    let resolvedCommunityNames: Record<string, string> = {};

    // Fetch news items in separate try/catch
    try {
      newsItems = await newsItemsTask;

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
        const communityHydrationStartedAt = performanceNow();
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
            if (!isCurrentRequest()) {
              return;
            }

            resolvedCommunityNames = newCommunityMap;

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
        } finally {
          logPerformanceTiming(
            'FeedFetch',
            'secondary-community-identities',
            communityHydrationStartedAt,
            { requestedCount: uniqueCommunityIds.length },
          );
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

    const persistedCommunityFeedEntries = await persistedCommunityFeedTask;
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

    if (!isCurrentRequest()) {
      return;
    }

    if (
      communityFeedEntries.length > 0 ||
      Object.keys(resolvedCommunityNames).length > 0
    ) {
      const recentCommunityMap: Record<string, string> = {
        ...resolvedCommunityNames,
      };
      communityFeedEntries.forEach((community) => {
        recentCommunityMap[community.community_id] = community.name;
      });
      setCommunityMap((previousMap) =>
        mergeCommunityNames(previousMap, recentCommunityMap),
      );
    }

    // Fetch event-like Home sources separately from posts/news.
    [upcomingEvents, upcomingBusTrips, homeFanActivities] = await Promise.all([
      upcomingEventsTask,
      upcomingBusTripsTask,
      homeFanActivitiesTask,
    ]);

    try {
      weeklyTopFanItem = await weeklyTopFanTask;
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        console.log(
          '[FeedProvider] weekly_top_fan fetch result',
          weeklyTopFanItem
            ? {
                id: weeklyTopFanItem.id,
                weekStartDate: weeklyTopFanItem.weekStartDate,
                userId: weeklyTopFanItem.userId,
              }
            : null,
        );
      }
    } catch (e: any) {
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        logger.warn('[FeedProvider] fetchLatestPublishedWeeklyTopFan failed:', e?.message || e);
        console.log('[FeedProvider] weekly_top_fan fetch threw, continuing without card', {
          message: e?.message ?? String(e),
        });
      }
      weeklyTopFanItem = null;
    }
    await profileHydrationTask;
    if (!isCurrentRequest()) {
      return;
    }

    // Merge posts, news, events, and bus trips into combined feed
    try {
      const safePostsArray = transformedPosts ?? [];
      const safeNewsArray = newsItems ?? [];
      const safeEventsArray = upcomingEvents ?? [];
      const safeBusTripsArray = upcomingBusTrips ?? [];
      const safeFanActivitiesArray = homeFanActivities ?? [];
      const safeCommunityFeedEntries = communityFeedEntries ?? [];
      const refreshedWeeklyTopFanLevel = weeklyTopFanItem
        ? refreshedProfileMap[weeklyTopFanItem.userId]?.fan_level_key
        : null;
      const safeWeeklyTopFanItem =
        weeklyTopFanItem && refreshedWeeklyTopFanLevel
          ? {
              ...weeklyTopFanItem,
              fanLevelKey: refreshedWeeklyTopFanLevel,
            }
          : weeklyTopFanItem;
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        console.log(
          '[FeedProvider] injecting weekly_top_fan into feeds',
          safeWeeklyTopFanItem
            ? {
                id: safeWeeklyTopFanItem.id,
                weekStartDate: safeWeeklyTopFanItem.weekStartDate,
              }
            : null,
        );
      }
      const mixedFeedBuildStartedAt = performanceNow();
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
      logPerformanceTiming('FeedMap', 'secondary-low-priority-build', mixedFeedBuildStartedAt, {
        feedItemCount: nextFeedItems.length,
        homeItemCount: nextHomeFeedItems.length,
      });
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        console.log('[FeedProvider] weekly_top_fan injected state', {
          feedHasCard: nextFeedItems.some((item) => item.kind === 'weekly_top_fan'),
          homeHasCardBeforeRanking: nextHomeFeedItems.some(
            (item) => item.kind === 'weekly_top_fan',
          ),
          weeklyTopFanId: safeWeeklyTopFanItem?.id ?? null,
        });
      }

      if (!isCurrentRequest()) {
        return;
      }

      logPerformanceTiming('FeedFetch', 'low-priority-feed-built', fetchStartedAt, {
        feedItemCount: nextFeedItems.length,
        homeItemCount: nextHomeFeedItems.length,
        sourceMode: 'deferred-expansion',
      });
      logHomeFeedSnapshot('built', nextHomeFeedItems, baseDate);

      const preliminaryFeedItems = withFeedEngagementSummary(
        nextFeedItems,
        likeMapRef.current,
        commentCountMapRef.current,
      );
      const preliminaryHomeItems = sortHomeFeedItems(
        withFeedEngagementSummary(
          nextHomeFeedItems,
          likeMapRef.current,
          commentCountMapRef.current,
        ),
        baseDate,
      );
      const expandedPublicationStartedAt = performanceNow();
      setFeedItems((previousItems) =>
        reconcileFeedItemIdentities(previousItems, preliminaryFeedItems),
      );
      setHomeFeedItems((previousItems) =>
        reconcileFeedItemIdentities(previousItems, preliminaryHomeItems),
      );
      logPerformanceTiming(
        'FeedPublication',
        'mixed-expanded-enqueued',
        expandedPublicationStartedAt,
        {
          feedItemCount: preliminaryFeedItems.length,
          homeItemCount: preliminaryHomeItems.length,
        },
      );
      logPerformanceTiming('FeedItemsReady', 'mixed-feed-expanded', fetchStartedAt, {
        feedItemCount: preliminaryFeedItems.length,
        homeItemCount: preliminaryHomeItems.length,
        engagementPending: !secondaryEngagementComplete,
      });

      // Fetch like and comment counts for all feed items
      // Note: get_like_state_v2 doesn't support user context, so liked will always be false
      // Individual like state will be fetched when user interacts

      // Group items by kind
      const postIds = safePostsArray.map((p) => p.id);
      const newsIds = safeNewsArray.map((n) => n.id);
      const eventIds = safeEventsArray.map((e) => e.id);
      const busTripIds = safeBusTripsArray.map((b) => b.id);

      await Promise.all([secondaryEngagementTask, postEngagementCountsTask]);

      if (!isCurrentRequest()) {
        return;
      }

      const mergedLikeMap = likeMapRef.current;
      const rankedHomeFeedItems = sortHomeFeedItems(
        withFeedEngagementSummary(
          nextHomeFeedItems,
          mergedLikeMap,
          commentCountMapRef.current,
        ),
        baseDate,
      );
      logPerformanceTiming('FeedItemsReady', 'mixed-feed-engagement-applied', fetchStartedAt, {
        feedItemCount: nextFeedItems.length,
        homeItemCount: rankedHomeFeedItems.length,
      });
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        console.log('[FeedProvider] weekly_top_fan after home ranking', {
          homeHasCardAfterRanking: rankedHomeFeedItems.some(
            (item) => item.kind === 'weekly_top_fan',
          ),
          weeklyTopFanId: safeWeeklyTopFanItem?.id ?? null,
        });
      }

      await secondaryPreviewsTask;

      // ── Rehydrate likedByMe from likes_v2 for current user ──
      try {
        if (currentUserId) {
          const [myPostLikes, myNewsLikes, myEventLikes, myBusTripLikes] = await Promise.all([
            fetchMyLikedIds(currentUserId, POST_ENGAGEMENT_TARGET_TYPE, postIds).catch(
              () => new Set<string>(),
            ),
            fetchMyLikedIds(currentUserId, 'news', newsIds).catch(() => new Set<string>()),
            fetchMyLikedIds(currentUserId, 'event', eventIds).catch(() => new Set<string>()),
            fetchMyLikedIds(currentUserId, 'bus_trip', busTripIds).catch(() => new Set<string>()),
          ]);

          const patchedLikeMap = { ...mergedLikeMap };
          const patchLiked = (kind: LikeTargetType, ids: string[], mySet: Set<string>) => {
            for (const id of ids) {
              if (mySet.has(id)) {
                const key = targetKey(kind, id);
                patchedLikeMap[key] = { ...patchedLikeMap[key], liked: true };
              }
            }
          };
          patchLiked(POST_ENGAGEMENT_TARGET_TYPE, postIds, myPostLikes);
          patchLiked('news', newsIds, myNewsLikes);
          patchLiked('event', eventIds, myEventLikes);
          patchLiked('bus_trip', busTripIds, myBusTripLikes);

          if (!isCurrentRequest()) {
            return;
          }

          const mergedPatchedLikeMap = mergeFetchedLikeMapPreservingLikedState(
            likeMapRef.current,
            patchedLikeMap,
          );
          likeMapRef.current = mergedPatchedLikeMap;
          setLikeMap(mergedPatchedLikeMap);
        }
      } catch (e) {
        logger.warn('[FeedProvider] likedByMe rehydration failed:', e);
      }

      // ── Batch fetch attendance for events and bus trips ──
      try {
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

            if (!isCurrentRequest()) {
              return;
            }

            setAttendanceMap(attendanceByEntity);
          } else {
            logger.warn('[FeedProvider] Attendance fetch failed:', rsvpError);
          }
        }
      } catch (e) {
        logger.warn('[FeedProvider] Attendance fetch error:', e);
      }

      if (!isCurrentRequest()) {
        return;
      }

      logHomeFeedSnapshot('final', rankedHomeFeedItems, baseDate);
    } catch (e: any) {
      logger.error('[FeedProvider] Error merging feed:', e?.message || e);
    }

    if (isCurrentRequest()) {
      setLoading(false);
      logPerformanceTiming('FeedFetch', 'complete', fetchStartedAt, {
        postCount: transformedPosts.length,
      });
    }
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
      const key = targetKey(POST_ENGAGEMENT_TARGET_TYPE, postId);

      setLikeMap((prev) => {
        if (prev[key]) {
          return prev;
        }

        const next = {
          ...prev,
          [key]: { liked, likes },
        };
        likeMapRef.current = next;
        return next;
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
      const currentState = likeMapRef.current[key] || { liked: false, likes: 0 };

      // Optimistic update
      const newLiked = !currentState.liked;
      const newLikes = newLiked ? currentState.likes + 1 : Math.max(0, currentState.likes - 1);

      setLikeMap((prev) => {
        const next = {
          ...prev,
          [key]: { liked: newLiked, likes: newLikes },
        };
        likeMapRef.current = next;
        return next;
      });
      setFeedItems((prev) => patchFeedItemEngagement(prev, kind, id, { likeCount: newLikes }));
      setHomeFeedItems((prev) => patchFeedItemEngagement(prev, kind, id, { likeCount: newLikes }));

      // Persist to DB
      try {
        const success = await toggleLikeApi(kind, id, userId, currentState.liked);
        if (!success) {
          logger.warn('[toggleLike failed]', { targetType: kind, targetId: id, error: 'unknown' });
          // Revert on failure
          setLikeMap((prev) => {
            const next = {
              ...prev,
              [key]: currentState,
            };
            likeMapRef.current = next;
            return next;
          });
          setFeedItems((prev) =>
            patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
          );
          setHomeFeedItems((prev) =>
            patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
          );
          return;
        }
        logger.log('[toggleLike ok]', { targetType: kind, targetId: id });
      } catch (error) {
        logger.warn('[toggleLike failed]', { targetType: kind, targetId: id, error });
        // Revert on failure
        setLikeMap((prev) => {
          const next = {
            ...prev,
            [key]: currentState,
          };
          likeMapRef.current = next;
          return next;
        });
        setFeedItems((prev) =>
          patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
        );
        setHomeFeedItems((prev) =>
          patchFeedItemEngagement(prev, kind, id, { likeCount: currentState.likes }),
        );
      }
    },
    [patchFeedItemEngagement],
  );

  const incrementCommentCount = useCallback(
    (kind: LikeTargetType, id: string) => {
      const key = targetKey(kind, id);
      const nextCommentCount = (commentCountMapRef.current[key] || 0) + 1;
      const nextCommentCountMap = {
        ...commentCountMapRef.current,
        [key]: nextCommentCount,
      };
      commentCountMapRef.current = nextCommentCountMap;
      setCommentCountMap(nextCommentCountMap);
      setFeedItems((prev) =>
        patchFeedItemEngagement(prev, kind, id, { commentCount: nextCommentCount }),
      );
      setHomeFeedItems((prev) =>
        patchFeedItemEngagement(prev, kind, id, { commentCount: nextCommentCount }),
      );
    },
    [patchFeedItemEngagement],
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

  const contextValue = useMemo<FeedContextType>(
    () => ({
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
    }),
    [
      addCommentPreview,
      addCommunityFeedItem,
      addPost,
      attendanceMap,
      commentCountMap,
      commentPreviewMap,
      communityMap,
      error,
      feedItems,
      fetchPosts,
      homeFeedItems,
      hydratePostEngagement,
      incrementCommentCount,
      likeMap,
      loading,
      posts,
      profileMap,
      removeNews,
      removePost,
      toggleLike,
    ],
  );

  useEffect(() => {
    logPerformanceTiming('FeedPublication', 'context-value-committed', providerRenderStartedAt, {
      postCount: contextValue.posts.length,
      feedItemCount: contextValue.feedItems.length,
      homeItemCount: contextValue.homeFeedItems.length,
      profileCount: Object.keys(contextValue.profileMap).length,
      communityCount: Object.keys(contextValue.communityMap).length,
      loading: contextValue.loading,
    });
  }, [contextValue, providerRenderStartedAt]);

  return (
    <FeedContext.Provider
      value={contextValue}
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
