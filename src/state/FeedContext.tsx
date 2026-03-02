import React, { createContext, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchBusTripsUpcoming,
  fetchEventsUpcoming,
  type BusTrip,
  type Event,
} from '../services/eventsApi';
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
import { FeedItem } from '../types/feed';
import { NewsItem } from '../types/news';
import { Post } from '../types/post';
import { normalizeMedia } from '../utils/media';
import { targetKey } from '../utils/targetKey';

// Helper to safely extract created timestamp from FeedItem
const getCreated = (item: FeedItem) => {
  if (item.kind === 'post') {
    const p = item.data as any;
    return p.created_at ?? p.createdAt ?? p.createdAtISO ?? null;
  }
  if (item.kind === 'news') {
    const n = item.data as any;
    return n.created_at ?? n.createdAt ?? n.createdAtISO ?? n.publishedAt ?? null;
  }
  if (item.kind === 'event' || item.kind === 'bus_trip') {
    const e = item.data as any;
    return e.createdAt ?? e.created_at ?? e.startAt ?? e.start_at ?? null;
  }
  return null;
};

interface FeedContextType {
  posts: Post[];
  feedItems: FeedItem[]; // Combined feed using unified FeedItem type
  communityMap: Record<string, string>; // Map of community ID -> name
  profileMap: Record<string, { display_name: string | null; avatar_url: string | null }>; // Map of user ID -> profile
  likeMap: Record<string, { liked: boolean; likes: number }>; // Like states by "${kind}:${id}"
  commentCountMap: Record<string, number>; // Comment counts by "${kind}:${id}"
  commentPreviewMap: Record<string, CommentPreview[]>; // Comment previews by "${kind}:${id}"
  attendanceMap: Record<string, { count: number; avatars: string[]; isGoing: boolean }>; // Attendance by event/bus_trip ID
  addPost: (post: Post) => void;
  removePost: (postId: string) => void;
  removeNews: (newsId: string) => void;
  fetchPosts: () => Promise<void>;
  toggleLike: (kind: LikeTargetType, id: string, userId: string) => Promise<void>;
  incrementCommentCount: (kind: LikeTargetType, id: string) => void;
  addCommentPreview: (kind: LikeTargetType, id: string, comment: CommentPreview) => void;
  loading: boolean;
  error: string | null;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [communityMap, setCommunityMap] = useState<Record<string, string>>({});
  const [profileMap, setProfileMap] = useState<
    Record<string, { display_name: string | null; avatar_url: string | null }>
  >({});
  const [likeMap, setLikeMap] = useState<Record<string, { liked: boolean; likes: number }>>({});
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [commentPreviewMap, setCommentPreviewMap] = useState<Record<string, CommentPreview[]>>({});
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { count: number; avatars: string[]; isGoing: boolean }>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    let transformedPosts: Post[] = [];
    let newsItems: NewsItem[] = [];
    let upcomingEvents: Event[] = [];
    let upcomingBusTrips: BusTrip[] = [];

    // Fetch posts in separate try/catch so news_items errors don't block posts
    try {
      const { data: postsData, error: fetchError } = await supabase
        .from('posts')
        .select('id, created_at, author_id, text, media, community_id')
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      // Fetch author profiles for all posts
      const authorIds = [...new Set((postsData || []).map((p) => p.author_id).filter(Boolean))];
      const newProfileMap: Record<
        string,
        { display_name: string | null; avatar_url: string | null }
      > = {};

      if (authorIds.length > 0) {
        try {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', authorIds);

          if (!profileError && profiles) {
            profiles.forEach((profile) => {
              newProfileMap[profile.id] = {
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              };
            });
          }
        } catch (e) {
          console.warn('[FeedProvider] Failed to fetch profiles:', e);
        }
      }

      setProfileMap(newProfileMap);

      // Transform DB posts to Post type with normalized media
      transformedPosts = (postsData || []).map((dbPost) => ({
        id: dbPost.id,
        authorName: newProfileMap[dbPost.author_id]?.display_name || 'Fan',
        authorId: dbPost.author_id,
        communityId: dbPost.community_id ?? null,
        createdAt: dbPost.created_at,
        text: dbPost.text,
        likesCount: 0, // TODO: Add likes support
        commentsCount: 0, // TODO: Count comments
        likedByMe: false,
        media: normalizeMedia(dbPost.media), // Normalize media from DB
      }));

      setPosts(transformedPosts);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      console.error('[FeedProvider] fetchPosts (posts) error:', errorMsg);
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
        .map((post) => post.communityId)
        .filter(Boolean) as string[];

      if (communityIds.length > 0 || postCommunityIds.length > 0) {
        const uniqueCommunityIds = [...new Set([...communityIds, ...postCommunityIds])];
        try {
          const { data: communities, error: commError } = await supabase
            .from('communities')
            .select('id, name')
            .in('id', uniqueCommunityIds);

          if (!commError && communities) {
            const newCommunityMap: Record<string, string> = {};
            communities.forEach((c) => {
              newCommunityMap[c.id] = c.name;
            });
            setCommunityMap(newCommunityMap);
          }
        } catch (e) {
          console.warn('[FeedProvider] Failed to fetch community names:', e);
        }
      }
    } catch (e: any) {
      // News fetch failed, but don't block posts
      console.warn(
        '[FeedProvider] fetchNewsItems failed (will continue with posts only):',
        e?.message || e,
      );
      newsItems = [];
    }

    // Fetch events + bus trips in separate try/catch
    try {
      const results = await Promise.allSettled([
        fetchEventsUpcoming(20),
        fetchBusTripsUpcoming(20),
      ]);
      upcomingEvents = results[0].status === 'fulfilled' ? results[0].value : [];
      upcomingBusTrips = results[1].status === 'fulfilled' ? results[1].value : [];
    } catch (e: any) {
      console.warn('[FeedProvider] fetchEventsUpcoming/busTrips failed:', e?.message || e);
      upcomingEvents = [];
      upcomingBusTrips = [];
    }

    // Merge posts, news, events, and bus trips into combined feed
    try {
      const safePostsArray = transformedPosts ?? [];
      const safeNewsArray = newsItems ?? [];
      const safeEventsArray = upcomingEvents ?? [];
      const safeBusTripsArray = upcomingBusTrips ?? [];

      const combinedFeed: FeedItem[] = [
        ...safePostsArray.map((post): FeedItem => ({ kind: 'post', id: post.id, data: post })),
        ...safeNewsArray.map((news): FeedItem => ({ kind: 'news', id: news.id, data: news })),
        ...safeEventsArray.map(
          (event): FeedItem => ({
            kind: 'event',
            id: event.id,
            data: {
              id: event.id,
              title: event.title,
              startAt: event.start_at ?? null,
              location: event.location_name ?? event.location_address ?? null,
              description: event.description ?? null,
              organizerName: event.organizer?.name ?? null,
              organizerGroupId: event.organizer_group_id ?? null,
              organizerType: event.organizer_type ?? null,
              organizerId: event.organizer_id ?? null,
              creatorUserId: event.creator_user_id ?? null,
              createdBy: event.created_by ?? null,
              createdAt: event.created_at ?? null,
              eventType: 'event',
              coverBucket: (event as any).cover_bucket ?? null,
              coverPath: (event as any).cover_path ?? null,
            },
          }),
        ),
        ...safeBusTripsArray.map(
          (busTrip): FeedItem => ({
            kind: 'bus_trip',
            id: busTrip.id,
            data: {
              id: busTrip.id,
              title: busTrip.title,
              startAt: busTrip.start_at ?? null,
              location: busTrip.departure_place ?? null,
              description: busTrip.description ?? null,
              organizerName: busTrip.organizer?.name ?? null,
              organizerGroupId: busTrip.organizer_group_id ?? null,
              organizerType: busTrip.organizer_group_id ? 'community' : null,
              organizerId: busTrip.organizer_group_id ?? null,
              createdAt: busTrip.created_at ?? null,
              eventType: 'bus_trip',
            },
          }),
        ),
      ];

      // Sort by timestamp descending with guard for missing timestamps
      combinedFeed.sort((a, b) => {
        const aTime = getCreated(a) ?? new Date().toISOString();
        const bTime = getCreated(b) ?? new Date().toISOString();
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setFeedItems(combinedFeed);

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
          console.warn('[FeedProvider] postLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('post', postIds).catch((err) => {
          console.warn('[FeedProvider] postComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('post', postIds).catch((err) => {
          console.warn('[FeedProvider] postPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('news', newsIds).catch((err) => {
          console.warn('[FeedProvider] newsLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('news', newsIds).catch((err) => {
          console.warn('[FeedProvider] newsComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('news', newsIds).catch((err) => {
          console.warn('[FeedProvider] newsPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('event', eventIds).catch((err) => {
          console.warn('[FeedProvider] eventLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('event', eventIds).catch((err) => {
          console.warn('[FeedProvider] eventComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('event', eventIds).catch((err) => {
          console.warn('[FeedProvider] eventPreviews failed:', err);
          return new Map();
        }),
        fetchLikeStates('bus_trip', busTripIds).catch((err) => {
          console.warn('[FeedProvider] busTripLikes failed:', err);
          return new Map();
        }),
        fetchCommentCounts('bus_trip', busTripIds).catch((err) => {
          console.warn('[FeedProvider] busTripComments failed:', err);
          return new Map();
        }),
        fetchCommentPreviews('bus_trip', busTripIds).catch((err) => {
          console.warn('[FeedProvider] busTripPreviews failed:', err);
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
        console.warn('[FeedProvider] likedByMe rehydration failed:', e);
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
            console.warn('[FeedProvider] Attendance fetch failed:', rsvpError);
          }
        }
      } catch (e) {
        console.warn('[FeedProvider] Attendance fetch error:', e);
      }

      setCommentCountMap(newCommentCountMap);
      setCommentPreviewMap(newCommentPreviewMap);
    } catch (e: any) {
      console.error('[FeedProvider] Error merging feed:', e?.message || e);
    }

    setLoading(false);
  }, []);

  const addPost = useCallback((post: Post) => {
    // Dedupe: if post with same ID exists, replace it; otherwise prepend
    setPosts((prev) => {
      const existingIndex = prev.findIndex((p) => p.id === post.id);
      if (existingIndex >= 0) {
        // Replace existing post
        const updated = [...prev];
        updated[existingIndex] = post;
        return updated;
      }
      // Prepend new post
      return [post, ...prev];
    });

    // Also update feedItems
    setFeedItems((prev) => {
      const feedPost: FeedItem = { kind: 'post', id: post.id, data: post };
      const existingIndex = prev.findIndex((item) => item.id === post.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = feedPost;
        return updated;
      }
      // Prepend and re-sort
      const updated = [feedPost, ...prev];
      updated.sort((a, b) => {
        const aTime = getCreated(a);
        const bTime = getCreated(b);
        if (!aTime || !bTime) return 0;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      return updated;
    });
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setFeedItems((prev) => prev.filter((item) => item.id !== postId));
  }, []);

  const removeNews = useCallback((newsId: string) => {
    setFeedItems((prev) => prev.filter((item) => !(item.kind === 'news' && item.id === newsId)));
  }, []);

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

      // Persist to DB
      try {
        const success = await toggleLikeApi(kind, id, userId, currentState.liked);
        if (!success) {
          console.warn('[toggleLike failed]', { targetType: kind, targetId: id, error: 'unknown' });
          // Revert on failure
          setLikeMap((prev) => ({
            ...prev,
            [key]: currentState,
          }));
          return;
        }
        console.log('[toggleLike ok]', { targetType: kind, targetId: id });
      } catch (error) {
        console.warn('[toggleLike failed]', { targetType: kind, targetId: id, error });
        // Revert on failure
        setLikeMap((prev) => ({
          ...prev,
          [key]: currentState,
        }));
      }
    },
    [likeMap],
  );

  const incrementCommentCount = useCallback((kind: LikeTargetType, id: string) => {
    const key = targetKey(kind, id);
    setCommentCountMap((prev) => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }));
  }, []);

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
        communityMap,
        profileMap,
        likeMap,
        commentCountMap,
        commentPreviewMap,
        attendanceMap,
        addPost,
        removePost,
        removeNews,
        fetchPosts,
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
