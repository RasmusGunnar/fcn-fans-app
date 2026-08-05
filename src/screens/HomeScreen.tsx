import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ViewToken,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import NextMatchBadge from '../components/home/NextMatchBadge';
import { Card } from '../components/ui/Card';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { useAttendance } from '../hooks/useAttendance';
import { useMatchCheckIn } from '../hooks/useMatchCheckIn';
import { useFeed } from '../state/FeedContext';
import { useNotificationUnread } from '../state/NotificationUnreadContext';
import { useAuth } from '../auth/AuthProvider';
import { colors, spacing, defaultTheme as theme } from '../theme';
import type { EventAttendeeListItemParam } from '../navigation/types';
import { getFeedItemKey, type FeedFanActivityData, type FeedItem } from '../types/feed';
import { filterHomeFeedItems, type HomeFeedFilter } from '../utils/homeFeedFilter';
import {
  buildHomeStartupMediaAudit,
  getFeedItemVisibleMediaKind,
} from '../utils/homeStartupPerformance';
import { fetchPrimaryFixture, formatShortDateDa, type Fixture } from '../services/fixtures';
import { fetchPostDetailById } from '../services/postsApi';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { isHomePost } from '../utils/homeFeed';
import { buildMatchdayUiModel } from '../utils/matchdayUiModel';
import {
  getAppPerformanceStartedAt,
  logPerformanceEvent,
  logPerformanceTiming,
  measurePerformanceWork,
  performanceNow,
  schedulePerformanceFrame,
} from '../utils/performanceTiming';

logPerformanceEvent('ScreenLifecycle', 'module-evaluated', { screen: 'HomeScreen' });

const HOME_FEED_FILTER_OPTIONS: { value: HomeFeedFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'fan_posts', label: 'Fan Posts' },
  { value: 'media_articles', label: 'FCN i medierne' },
];
const EMPTY_LIKE_STATE = { liked: false, likes: 0 };
const EMPTY_COMMENT_PREVIEWS: never[] = [];
let hasEnteredHomeScreen = false;

type HomeFeedFocusParams = {
  focusPostId?: string;
  feedItemType?: 'post' | 'media_article';
  focusRequestId?: string;
};

function formatKickoffCountdown(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart';
  if (diffHours < 48) return `Afspark om ${Math.ceil(diffHours)} timer`;
  return `Afspark om ${Math.ceil(diffHours / 24)} dage`;
}

function buildCheckInSocialProof(checkedInCount: number): {
  countLabel?: string | null;
  text: string;
} {
  if (checkedInCount <= 0) {
    return {
      countLabel: null,
      text: 'Ingen er på stadion endnu',
    };
  }

  return {
    countLabel: null,
    text:
      checkedInCount === 1
        ? '1 er på stadion'
        : `${checkedInCount.toLocaleString('da-DK')} er på stadion`,
  };
}

export default function HomeScreen() {
  if (!hasEnteredHomeScreen) {
    hasEnteredHomeScreen = true;
    logPerformanceEvent('ScreenLifecycle', 'component-first-entered', {
      screen: 'HomeScreen',
    });
  }

  const navigation = useNavigation();
  const route = useRoute() as { params?: HomeFeedFocusParams };
  const isHomeFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, isAppAdmin } = useAuth();
  const { unreadCount: notificationUnreadCount } = useNotificationUnread();
  const styles = homeStyles;
  const {
    homeFeedItems,
    communityMap,
    profileMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    fetchPosts,
    addPost,
    hydratePostEngagement,
    removePost,
    removeNews,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
    loading,
  } = useFeed();
  const refreshing = loading;
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [nextFixtureHeroUrl, setNextFixtureHeroUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<HomeFeedFilter>('all');
  const [pendingFeedFocus, setPendingFeedFocus] = useState<
    (HomeFeedFocusParams & { focusPostId: string; focusRequestId: string }) | null
  >(null);
  const feedListRef = useRef<FlatList<FeedItem>>(null);
  const handledFeedFocusRequestRef = useRef<string | null>(null);
  const focusLookupRequestRef = useRef<string | null>(null);
  const appStartedAtRef = useRef(getAppPerformanceStartedAt());
  const mountedAtRef = useRef(performanceNow());
  const initialHomeItemCountRef = useRef(Array.isArray(homeFeedItems) ? homeFeedItems.length : 0);
  const didLogFirstHomeRenderRef = useRef(false);
  const didLogFeedItemsAvailableRef = useRef(false);
  const didLogFirstFeedRenderRef = useRef(false);
  const didLogStartupMediaAuditRef = useRef(false);
  const didLogFlatListRenderedRef = useRef(false);
  const feedItemsReadyAtRef = useRef<number | null>(null);
  const nextMatchAttendance = useAttendance({
    entityType: 'match',
    entityId: nextFixture?.id ?? '',
  });
  const nextMatchCheckIn = useMatchCheckIn(nextFixture?.id ?? '', nextFixture?.kickoff_at ?? null);
  const nextMatchAttendanceRefresh = nextMatchAttendance.refresh;
  const nextMatchCheckInRefresh = nextMatchCheckIn.refresh;

  const safeHomeFeedItems = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'HomeScreen-filter-valid-feed-items',
        () => (Array.isArray(homeFeedItems) ? homeFeedItems : []).filter(Boolean),
        { sourceItemCount: Array.isArray(homeFeedItems) ? homeFeedItems.length : 0 },
      ),
    [homeFeedItems],
  );
  const visibleFeedItems = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'HomeScreen-filter-visible-feed-items',
        () => filterHomeFeedItems(safeHomeFeedItems, selectedFeedFilter),
        { sourceItemCount: safeHomeFeedItems.length, filter: selectedFeedFilter },
      ),
    [safeHomeFeedItems, selectedFeedFilter],
  );
  const filteredEmptyText =
    selectedFeedFilter === 'fan_posts'
      ? 'Ingen fanopslag endnu'
      : selectedFeedFilter === 'media_articles'
        ? 'Ingen artikler endnu'
        : null;

  // Ensure all maps have safe defaults
  const safeProfileMap = profileMap || {};
  const safeLikeMap = likeMap || {};
  const safeCommentCountMap = commentCountMap || {};
  const safeCommentPreviewMap = commentPreviewMap || {};

  const loadNextFixture = useCallback(async () => {
    const startedAt = performanceNow();
    setLoadingFixture(true);
    try {
      const fixture = await fetchPrimaryFixture();
      setNextFixture(fixture);

      let heroUrl = getMatchHeroUrl(fixture);
      const homeTeamHeroId = fixture?.home_team_provider_id ?? fixture?.home_team_id ?? null;
      if (!heroUrl && homeTeamHeroId) {
        heroUrl = await getTeamHeroImage(homeTeamHeroId);
      }
      setNextFixtureHeroUrl(heroUrl);
    } finally {
      setLoadingFixture(false);
      logPerformanceTiming('HomeFocusWork', 'load-next-fixture', startedAt);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    const focusPostId = route.params?.focusPostId?.trim();
    if (!isHomeFocused || !focusPostId) return;

    const focusRequestId = route.params?.focusRequestId?.trim() || focusPostId;
    if (handledFeedFocusRequestRef.current === focusRequestId) return;

    setSelectedFeedFilter('all');
    setPendingFeedFocus({
      focusPostId,
      focusRequestId,
      ...(route.params?.feedItemType ? { feedItemType: route.params.feedItemType } : {}),
    });
  }, [
    isHomeFocused,
    route.params?.feedItemType,
    route.params?.focusPostId,
    route.params?.focusRequestId,
  ]);

  const completeFeedFocus = useCallback(
    (focusRequestId: string) => {
      handledFeedFocusRequestRef.current = focusRequestId;
      setPendingFeedFocus(null);
      (navigation as any).setParams({
        focusPostId: undefined,
        feedItemType: undefined,
        focusRequestId: undefined,
      });
    },
    [navigation],
  );

  useEffect(() => {
    if (!pendingFeedFocus || !isHomeFocused) return;

    const targetIndex = visibleFeedItems.findIndex(
      (item) => item.kind === 'post' && item.id === pendingFeedFocus.focusPostId,
    );
    if (targetIndex < 0) return;

    const frame = requestAnimationFrame(() => {
      feedListRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.08,
      });
      completeFeedFocus(pendingFeedFocus.focusRequestId);
    });

    return () => cancelAnimationFrame(frame);
  }, [completeFeedFocus, isHomeFocused, pendingFeedFocus, visibleFeedItems]);

  useEffect(() => {
    if (!pendingFeedFocus || loading || !isHomeFocused) return;
    if (
      safeHomeFeedItems.some(
        (item) => item.kind === 'post' && item.id === pendingFeedFocus.focusPostId,
      )
    ) {
      return;
    }
    if (focusLookupRequestRef.current === pendingFeedFocus.focusRequestId) return;

    focusLookupRequestRef.current = pendingFeedFocus.focusRequestId;
    let cancelled = false;

    void fetchPostDetailById(pendingFeedFocus.focusPostId, user?.id ?? null)
      .then((detail) => {
        if (cancelled) return;
        if (!detail || !isHomePost(detail.post)) {
          completeFeedFocus(pendingFeedFocus.focusRequestId);
          return;
        }

        addPost(detail.post);
        hydratePostEngagement({
          postId: detail.post.id,
          liked: detail.engagement.liked,
          likes: detail.engagement.likes,
          commentsCount: detail.engagement.commentsCount,
          commentPreviews: detail.engagement.commentPreviews,
        });
      })
      .catch(() => {
        if (!cancelled) {
          completeFeedFocus(pendingFeedFocus.focusRequestId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    addPost,
    completeFeedFocus,
    hydratePostEngagement,
    isHomeFocused,
    loading,
    pendingFeedFocus,
    safeHomeFeedItems,
    user?.id,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (didLogFirstHomeRenderRef.current) {
        return;
      }

      didLogFirstHomeRenderRef.current = true;
      logPerformanceEvent('ScreenLifecycle', 'first-render-committed', {
        screen: 'HomeScreen',
      });
      logPerformanceEvent('ScreenLifecycle', 'first-visible-shell-rendered', {
        screen: 'HomeScreen',
        shell: 'feed',
      });
      logPerformanceTiming('HomeFirstRender', 'screen-rendered', appStartedAtRef.current, {
        itemCount: initialHomeItemCountRef.current,
        sinceHomeMountMs: Math.round(performanceNow() - mountedAtRef.current),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const focusStartedAt = performanceNow();
      logPerformanceEvent('ScreenLifecycle', 'focus-effect-started', {
        screen: 'HomeScreen',
      });
      const cancelFrame = schedulePerformanceFrame(() => {
        logPerformanceTiming('ScreenLifecycle', 'focus-effect-finished', focusStartedAt, {
          screen: 'HomeScreen',
        });
        logPerformanceEvent('ScreenLifecycle', 'focus-visible-shell-rendered', {
          screen: 'HomeScreen',
          shell: 'feed',
        });
      });

      return cancelFrame;
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      void loadNextFixture();
    }, [loadNextFixture]),
  );

  useFocusEffect(
    useCallback(() => {
      if (nextFixture?.id) {
        void nextMatchAttendanceRefresh();
        void nextMatchCheckInRefresh();
      }
    }, [nextFixture?.id, nextMatchAttendanceRefresh, nextMatchCheckInRefresh]),
  );

  useEffect(() => {
    if (didLogFeedItemsAvailableRef.current || safeHomeFeedItems.length === 0) {
      return;
    }

    didLogFeedItemsAvailableRef.current = true;
    feedItemsReadyAtRef.current = performanceNow();
    logPerformanceEvent('ScreenLifecycle', 'data-ready', {
      screen: 'HomeScreen',
      itemCount: safeHomeFeedItems.length,
    });
    logPerformanceTiming('FeedItemsReady', 'home-data-received', appStartedAtRef.current, {
      itemCount: safeHomeFeedItems.length,
      sinceHomeMountMs: Math.round(performanceNow() - mountedAtRef.current),
    });
  }, [safeHomeFeedItems.length]);

  useEffect(() => {
    if (didLogFirstFeedRenderRef.current || visibleFeedItems.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      didLogFirstFeedRenderRef.current = true;
      logPerformanceTiming('HomeFirstRender', 'first-feed-render', appStartedAtRef.current, {
        itemCount: visibleFeedItems.length,
        filter: selectedFeedFilter,
        sinceHomeMountMs: Math.round(performanceNow() - mountedAtRef.current),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedFeedFilter, visibleFeedItems.length]);

  useEffect(() => {
    if (didLogStartupMediaAuditRef.current || visibleFeedItems.length === 0) {
      return;
    }

    didLogStartupMediaAuditRef.current = true;
    logPerformanceTiming('HomeFirstRender', 'startup-media-audit', appStartedAtRef.current, {
      ...buildHomeStartupMediaAudit(visibleFeedItems),
      filter: selectedFeedFilter,
      sinceHomeMountMs: Math.round(performanceNow() - mountedAtRef.current),
    });
  }, [selectedFeedFilter, visibleFeedItems]);

  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);

  // Reset active video when the feed filter changes so no stale player stays mounted
  useEffect(() => {
    setActiveVideoKey(null);
  }, [selectedFeedFilter]);

  // Stable viewability config — 65 % of item must be visible for at least 200 ms
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 65,
    minimumViewTime: 200,
  });

  // Stable callback ref — never recreated, so FlatList never remounts cells
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVideo = viewableItems.find(
      ({ item, isViewable }: ViewToken) =>
        isViewable && getFeedItemVisibleMediaKind(item as FeedItem) === 'video',
    );
    const nextKey = firstVideo ? getFeedItemKey(firstVideo.item as FeedItem) : null;
    setActiveVideoKey((prev) => {
      if (prev === nextKey) return prev;
      if (__DEV__) {
        console.log('[HomeScreen] activeVideoKey →', nextKey);
      }
      return nextKey;
    });
  });

  const handleFlatListContentSizeChange = useCallback(
    (width: number, height: number) => {
      if (didLogFlatListRenderedRef.current || visibleFeedItems.length === 0 || height <= 0) {
        return;
      }

      didLogFlatListRenderedRef.current = true;
      logPerformanceTiming('FlatListRendered', 'content-ready', appStartedAtRef.current, {
        itemCount: visibleFeedItems.length,
        width: Math.round(width),
        height: Math.round(height),
        sinceHomeMountMs: Math.round(performanceNow() - mountedAtRef.current),
        sinceFeedItemsReadyMs:
          feedItemsReadyAtRef.current == null
            ? null
            : Math.round(performanceNow() - feedItemsReadyAtRef.current),
      });
    },
    [visibleFeedItems.length],
  );

  const matchForBadge = useMemo(
    () =>
      nextFixture
        ? {
            id: nextFixture.id,
            coverUrl: nextFixtureHeroUrl,
            homeTeam: nextFixture.home_team,
            awayTeam: nextFixture.away_team,
            homeLogo: nextFixture.home_logo_url ?? null,
            awayLogo: nextFixture.away_logo_url ?? null,
            kickoff: nextFixture.kickoff_at,
            venue: nextFixture.venue ?? null,
            venueCity: nextFixture.venue_city ?? null,
            title: `${nextFixture.home_team} vs ${nextFixture.away_team}`,
            subtitle: formatShortDateDa(nextFixture.kickoff_at),
          }
        : null,
    [nextFixture, nextFixtureHeroUrl],
  );

  const nextMatchCountdownLabel = useMemo(() => {
    if (!nextFixture?.kickoff_at) return null;
    return formatKickoffCountdown(nextFixture.kickoff_at, now);
  }, [nextFixture?.kickoff_at, now]);

  const nextMatchUiModel = useMemo(() => {
    if (!nextFixture?.kickoff_at) return null;

    return buildMatchdayUiModel({
      kickoffAt: nextFixture.kickoff_at,
      now,
      attendance: {
        isGoing: nextMatchAttendance.isGoing,
        countGoing: nextMatchAttendance.countGoing,
        avatars: nextMatchAttendance.avatars,
      },
      checkIn: {
        isCheckedIn: nextMatchCheckIn.isCheckedIn,
        countCheckedIn: nextMatchCheckIn.countCheckedIn,
        avatars: nextMatchCheckIn.avatars,
      },
    });
  }, [
    nextFixture?.kickoff_at,
    nextMatchAttendance.avatars,
    nextMatchAttendance.countGoing,
    nextMatchAttendance.isGoing,
    nextMatchCheckIn.avatars,
    nextMatchCheckIn.countCheckedIn,
    nextMatchCheckIn.isCheckedIn,
    now,
  ]);

  const nextMatchViewState = nextMatchUiModel?.viewState ?? 'pre_match';
  const nextMatchPanelTitle = useMemo(() => {
    if (nextMatchViewState === 'matchday_action') {
      return nextMatchUiModel?.effectiveIsGoing
        ? 'Du har sagt, at du kommer'
        : 'Er du på stadion i dag?';
    }

    if (nextMatchViewState === 'checked_in_confirmed') {
      return 'Du er tjekket ind';
    }

    return undefined;
  }, [nextMatchUiModel?.effectiveIsGoing, nextMatchViewState]);
  const nextMatchPanelBody = useMemo(() => {
    if (nextMatchViewState === 'matchday_action') {
      return nextMatchUiModel?.effectiveIsGoing
        ? 'Klar til at tjekke ind?'
        : 'Tjek ind, hvis du er med.';
    }

    if (nextMatchViewState === 'checked_in_confirmed') {
      return 'Fans kan nu se, at du er på stadion.';
    }

    return undefined;
  }, [nextMatchUiModel?.effectiveIsGoing, nextMatchViewState]);
  const nextMatchSocialCopyOverride = useMemo(() => {
    if (nextMatchViewState === 'matchday_action' || nextMatchViewState === 'checked_in_confirmed') {
      return buildCheckInSocialProof(nextMatchCheckIn.countCheckedIn);
    }

    return undefined;
  }, [nextMatchCheckIn.countCheckedIn, nextMatchViewState]);
  const nextMatchFansOverview = useMemo<EventAttendeeListItemParam[]>(() => {
    const profileById = new Map<string, { displayName: string | null; avatarUrl: string | null }>();

    nextMatchAttendance.profiles.forEach((profile) => {
      profileById.set(profile.user_id, {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      });
    });

    nextMatchCheckIn.profiles.forEach((profile) => {
      profileById.set(profile.user_id, {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      });
    });

    const merged = new Map<
      string,
      {
        item: EventAttendeeListItemParam;
        order: number;
      }
    >();
    let nextOrder = 0;

    nextMatchAttendance.userIds.forEach((userId) => {
      const profile = profileById.get(userId);
      merged.set(userId, {
        item: {
          userId,
          displayName: profile?.displayName ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          status: 'attendance',
        },
        order: nextOrder++,
      });
    });

    nextMatchCheckIn.userIds.forEach((userId) => {
      const profile = profileById.get(userId);
      const existing = merged.get(userId);

      merged.set(userId, {
        item: {
          userId,
          displayName: profile?.displayName ?? existing?.item.displayName ?? null,
          avatarUrl: profile?.avatarUrl ?? existing?.item.avatarUrl ?? null,
          status: 'checkin',
        },
        order: existing?.order ?? nextOrder++,
      });
    });

    return Array.from(merged.values())
      .sort((left, right) => {
        if (left.item.status !== right.item.status) {
          return left.item.status === 'checkin' ? -1 : 1;
        }

        return left.order - right.order;
      })
      .map((entry) => entry.item);
  }, [
    nextMatchAttendance.profiles,
    nextMatchAttendance.userIds,
    nextMatchCheckIn.profiles,
    nextMatchCheckIn.userIds,
  ]);
  const nextMatchPrimaryLabel =
    nextMatchViewState === 'checked_in_confirmed'
      ? undefined
      : nextMatchViewState === 'matchday_action'
        ? nextMatchCheckIn.loading
          ? 'Tjekker ind...'
          : 'Tjek ind'
        : nextMatchUiModel?.effectiveIsGoing
          ? 'Du kommer'
          : 'Jeg kommer';
  const nextMatchPrimaryDisabled =
    nextMatchViewState === 'checked_in_confirmed'
      ? true
      : nextMatchViewState === 'matchday_action'
        ? nextMatchCheckIn.loading
        : Boolean(nextMatchUiModel?.effectiveIsGoing) || nextMatchAttendance.loading;

  const handleOpenNextMatch = useCallback(() => {
    if (!matchForBadge) return;
    (navigation as any).navigate('MatchDetails', { fixtureId: matchForBadge.id });
  }, [matchForBadge, navigation]);

  const handleOpenNextMatchFans = useCallback(() => {
    if (!nextFixture?.id) return;
    (navigation as any).navigate('EventAttendees', {
      entityId: nextFixture.id,
      entityType: 'match',
      title: 'Fans til kampen',
      subtitle: 'Se hvem der kommer, og hvem der er tjekket ind',
      prefilledFans: nextMatchFansOverview,
    });
  }, [navigation, nextFixture?.id, nextMatchFansOverview]);

  const handleOpenProfile = useCallback(
    (userId: string) => {
      if (!userId) return;
      (navigation as any).navigate('PublicProfile', { userId });
    },
    [navigation],
  );

  const handleOpenNotifications = useCallback(() => {
    const tabNavigation = (navigation as any).getParent?.();
    (tabNavigation ?? navigation).navigate('Profile', { screen: 'Notifications' });
  }, [navigation]);

  const handleOpenPost = useCallback(
    (postId: string, commentId?: string | null) => {
      if (!postId) return;

      (navigation as any).navigate('PostDetail', {
        postId,
        targetType: commentId ? 'post_comment' : 'post',
        ...(commentId ? { commentId } : {}),
      });
    },
    [navigation],
  );

  const handleOpenEvent = useCallback(
    (eventId: string) => {
      const normalizedEventId = eventId.trim();
      if (!normalizedEventId) return;

      (navigation as any).navigate('Main', {
        screen: 'Events',
        params: { screen: 'EventDetails', params: { eventId: normalizedEventId } },
      });
    },
    [navigation],
  );

  const handleOpenCommunity = useCallback(
    (communityId: string, title: string) => {
      const normalizedCommunityId = communityId.trim();
      if (!normalizedCommunityId) return;

      (navigation as any).navigate('Main', {
        screen: 'Communities',
        params: {
          screen: 'CommunityDetail',
          params: { id: normalizedCommunityId, title: title.trim() || 'Fællesskab' },
        },
      });
    },
    [navigation],
  );

  const handleOpenFanActivity = useCallback(
    (item: FeedFanActivityData) => {
      const fanActivityId = item.id?.trim();
      const parentId = item.parentId?.trim();
      if (!fanActivityId || !parentId) return;

      if (item.parentType === 'match') {
        (navigation as any).navigate('MatchDetails', { fixtureId: parentId, fanActivityId });
        return;
      }

      (navigation as any).navigate('Main', {
        screen: 'Events',
        params: { screen: 'EventDetails', params: { eventId: parentId, fanActivityId } },
      });
    },
    [navigation],
  );

  const handleNextMatchPrimaryAction = useCallback(async () => {
    if (!nextFixture?.id) return;

    if (nextMatchViewState === 'matchday_action') {
      try {
        await nextMatchCheckIn.checkIn();
      } catch {
        // The status panel remains in its previous state when check-in fails.
      }
      return;
    }

    if (nextMatchViewState === 'pre_match' && !nextMatchAttendance.isGoing) {
      try {
        await nextMatchAttendance.toggleGoing();
      } catch {
        // The attendance hook restores its optimistic state on failure.
      }
    }
  }, [
    nextFixture?.id,
    nextMatchAttendance.isGoing,
    nextMatchAttendance.toggleGoing,
    nextMatchCheckIn.checkIn,
    nextMatchViewState,
  ]);

  const renderFeedItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const key = getFeedItemKey(item);
      const likeState = safeLikeMap[key] || EMPTY_LIKE_STATE;
      const commentCount = safeCommentCountMap[key] || 0;
      const commentPreviews = safeCommentPreviewMap[key] || EMPTY_COMMENT_PREVIEWS;

      return (
        <FeedItemRenderer
          item={item}
          itemKey={key}
          user={user}
          isAppAdmin={isAppAdmin}
          likeState={likeState}
          commentCount={commentCount}
          commentPreviews={commentPreviews}
          safeProfileMap={safeProfileMap}
          communityMap={communityMap}
          toggleLike={toggleLike}
          removePost={removePost}
          removeNews={removeNews}
          incrementCommentCount={incrementCommentCount}
          addCommentPreview={addCommentPreview}
          onPressProfile={handleOpenProfile}
          onPressPost={handleOpenPost}
          onPressEvent={handleOpenEvent}
          onPressCommunity={handleOpenCommunity}
          onPressFanActivity={handleOpenFanActivity}
          isActiveVideo={isHomeFocused && key === activeVideoKey}
        />
      );
    },
    [
      addCommentPreview,
      communityMap,
      handleOpenCommunity,
      handleOpenEvent,
      handleOpenFanActivity,
      handleOpenPost,
      handleOpenProfile,
      incrementCommentCount,
      isAppAdmin,
      isHomeFocused,
      removeNews,
      removePost,
      safeCommentCountMap,
      safeCommentPreviewMap,
      safeLikeMap,
      safeProfileMap,
      toggleLike,
      user,
      activeVideoKey,
    ],
  );

  const handleFeedScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      feedListRef.current?.scrollToOffset({
        offset: Math.max(0, averageItemLength * index),
        animated: false,
      });
      setTimeout(() => {
        feedListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.08 });
      }, 150);
    },
    [],
  );

  return (
    <FlatList<FeedItem>
      ref={feedListRef}
      data={visibleFeedItems}
      keyExtractor={getFeedItemKey}
      renderItem={renderFeedItem}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      updateCellsBatchingPeriod={16}
      windowSize={7}
      viewabilityConfig={viewabilityConfigRef.current}
      onViewableItemsChanged={onViewableItemsChangedRef.current}
      onContentSizeChange={handleFlatListContentSizeChange}
      onScrollToIndexFailed={handleFeedScrollToIndexFailed}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={fetchPosts}
          tintColor={colors.fcnRed}
          colors={[colors.fcnRed]}
        />
      }
      ListHeaderComponent={
        <>
          <AppHeader
            title="FC Nordsjælland"
            subtitle="Fan Fællesskab"
            onPressProfile={() => (navigation as any).navigate('Profile')}
            showNotificationButton
            notificationUnreadCount={notificationUnreadCount}
            onPressNotifications={handleOpenNotifications}
          />
          {matchForBadge ? (
            <NextMatchBadge
              match={matchForBadge}
              countdownLabel={nextMatchCountdownLabel ?? undefined}
              matchStatusPanel={{
                viewState: nextMatchViewState,
                isGoing: nextMatchUiModel?.effectiveIsGoing ?? nextMatchAttendance.isGoing,
                avatars: nextMatchUiModel?.socialAvatars ?? [],
                count: nextMatchUiModel?.socialCount ?? 0,
                titleOverride: nextMatchPanelTitle,
                bodyOverride: nextMatchPanelBody,
                socialCopyOverride: nextMatchSocialCopyOverride,
                primaryLabel: nextMatchPrimaryLabel,
                primaryDisabled: nextMatchPrimaryDisabled,
              }}
              onPress={handleOpenNextMatch}
              onPressPrimaryAction={handleNextMatchPrimaryAction}
              onPressSocial={handleOpenNextMatchFans}
            />
          ) : null}
          {loadingFixture ? (
            <View style={[styles.content, styles.matchFallbackContent]}>
              <Card style={styles.card}>
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Henter kampdata...</Text>
                </View>
              </Card>
            </View>
          ) : null}
          {!loadingFixture && !nextFixture ? (
            <View style={[styles.content, styles.matchFallbackContent]}>
              <Card style={styles.card}>
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Ingen kommende kampe endnu</Text>
                  <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
                </View>
              </Card>
            </View>
          ) : null}
          <View style={styles.content}>
            <View style={styles.feedFilterBar}>
              {HOME_FEED_FILTER_OPTIONS.map((option) => {
                const isSelected = selectedFeedFilter === option.value;

                return (
                  <Pressable
                    key={option.value}
                    style={[styles.feedFilterTab, isSelected && styles.feedFilterTabActive]}
                    onPress={() => setSelectedFeedFilter(option.value)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.feedFilterTabText,
                        isSelected && styles.feedFilterTabTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!loading && filteredEmptyText && visibleFeedItems.length === 0 ? (
              <View style={styles.feedEmptyState}>
                <Text style={styles.feedEmptyText}>{filteredEmptyText}</Text>
              </View>
            ) : null}
          </View>
        </>
      }
    />
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing[0], paddingVertical: spacing.md },
    matchFallbackContent: { paddingTop: spacing.lg },
    card: { marginBottom: spacing.md },
    feedFilterBar: {
      flexDirection: 'row',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      marginBottom: theme.spacing[4],
    },
    feedFilterTab: {
      flex: 1,
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[1],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    feedFilterTabActive: {
      borderColor: colors.fcnRed,
      backgroundColor: colors.fcnRed,
    },
    feedFilterTabText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    feedFilterTabTextActive: {
      color: colors.card,
    },
    feedEmptyState: {
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[10],
      alignItems: 'center',
    },
    feedEmptyText: {
      color: colors.subtext,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    loadingContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    loadingText: { fontSize: 14, color: colors.subtext },
    emptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
    emptySubtext: { fontSize: 14, color: colors.subtext },
  });

const homeStyles = createStyles();
