import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import NextMatchBadge from '../components/home/NextMatchBadge';
import { Card } from '../components/ui/Card';
import { useAttendance } from '../hooks/useAttendance';
import { useMatchCheckIn } from '../hooks/useMatchCheckIn';
import {
  fetchUpcomingFixtures,
  formatShortDateDa,
  isFcnHomeFixture,
  type Fixture,
} from '../services/fixtures';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { useFeed } from '../state/FeedContext';
import { colors, defaultTheme, spacing } from '../theme';
import type { FeedFanActivityData, FeedItem } from '../types/feed';
import { getFeedItemKey } from '../types/feed';
import { buildMatchdayUiModel } from '../utils/matchdayUiModel';
import { getPrimaryMediaKind } from '../utils/media';

const HOME_NEXT_MATCH_LOOKAHEAD_LIMIT = 20;

function formatKickoffCountdown(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart';
  if (diffHours < 48) return `Afspark om ${Math.ceil(diffHours)} timer`;
  return `Afspark om ${Math.ceil(diffHours / 24)} dage`;
}

function buildCheckInSocialProof(
  checkedInCount: number,
): { countLabel?: string | null; text: string } {
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

function getHomeFeedItemSpacingCompensation(kind: FeedItem['kind']): number {
  switch (kind) {
    case 'weekly_top_fan':
      return defaultTheme.layout.listGap + defaultTheme.spacing[1];
    case 'post':
    case 'news':
    case 'event':
    case 'bus_trip':
    case 'match':
    case 'community':
      return defaultTheme.layout.listGap;
    case 'fan_activity':
    default:
      return 0;
  }
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, isAppAdmin } = useAuth();
  const styles = createStyles();
  const {
    homeFeedItems,
    communityMap,
    profileMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    attendanceMap,
    fetchPosts,
    removePost,
    removeNews,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
    loading,
  } = useFeed();
  const [nextFixture, setNextFixture] = useState<Fixture | null>(null);
  const [loadingFixture, setLoadingFixture] = useState(false);
  const [nextFixtureHeroUrl, setNextFixtureHeroUrl] = useState<string | null>(null);
  const [currentPlayingVideoPostId, setCurrentPlayingVideoPostId] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const nextMatchAttendance = useAttendance({
    entityType: 'match',
    entityId: nextFixture?.id ?? '',
  });
  const nextMatchCheckIn = useMatchCheckIn(nextFixture?.id ?? '', nextFixture?.kickoff_at ?? null);
  const nextMatchAttendanceRefresh = nextMatchAttendance.refresh;
  const nextMatchCheckInRefresh = nextMatchCheckIn.refresh;

  // Rate-limit focus refetches (skip if last fetch was < 5 s ago)
  const lastFocusFetchRef = useRef<number>(0);

  // Defensive: FeedContext now assembles a dedicated home feed.
  const safeHomeFeedItems = (Array.isArray(homeFeedItems) ? homeFeedItems : []).filter(Boolean);

  // Ensure all maps have safe defaults
  const safeProfileMap = profileMap || {};
  const safeLikeMap = likeMap || {};
  const safeCommentCountMap = commentCountMap || {};
  const safeCommentPreviewMap = commentPreviewMap || {};

  // Track which video post is visible for autoplay
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visibleVideoPost = viewableItems.find((viewableItem) => {
        const feedItem = viewableItem.item as any;
        if (!feedItem || feedItem.kind !== 'post') return false;
        const post = feedItem.data as any;
        return getPrimaryMediaKind(post?.media) === 'video';
      });

      if (visibleVideoPost?.item) {
        setCurrentPlayingVideoPostId(getFeedItemKey(visibleVideoPost.item as any));
      } else {
        setCurrentPlayingVideoPostId(null);
      }
    },
    [],
  );

  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 70,
      minimumViewTime: 100,
    }),
    [],
  );

  useEffect(() => {
    console.log('[HOME] mounted');
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
      if (state !== 'active') {
        setCurrentPlayingVideoPostId(null);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const loadNextFixture = async () => {
    setLoadingFixture(true);

    const upcomingFixtures = await fetchUpcomingFixtures(HOME_NEXT_MATCH_LOOKAHEAD_LIMIT);
    const fixture = upcomingFixtures[0] ?? null;

    console.log('[HOME][NEXT_MATCH] upcoming candidates', {
      total: upcomingFixtures.length,
      fixtures: upcomingFixtures.map((candidate, index) => ({
        index,
        id: candidate.id,
        homeTeam: candidate.home_team,
        awayTeam: candidate.away_team,
        kickoffAt: candidate.kickoff_at,
        isFcnHomeFixture: isFcnHomeFixture(candidate),
      })),
    });

    if (fixture) {
      console.log('[HOME][NEXT_MATCH] selected fixture', {
        id: fixture.id,
        opponents: `${fixture.home_team} vs ${fixture.away_team}`,
        kickoffAt: fixture.kickoff_at,
        reason: 'Selected the chronologically earliest upcoming FC Nordsjaelland fixture; home/away is ignored for primary selection.',
      });
    } else {
      console.log('[HOME][NEXT_MATCH] selected fixture', {
        id: null,
        opponents: null,
        kickoffAt: null,
        reason: 'No upcoming FC Nordsjaelland fixtures were available.',
      });
    }

    setNextFixture(fixture);

    // Resolve hero: try raw first, then team API
    let hero = getMatchHeroUrl(fixture as any);
    const homeTeamHeroId = fixture?.home_team_provider_id ?? fixture?.home_team_id ?? null;
    if (!hero && homeTeamHeroId) {
      hero = await getTeamHeroImage(homeTeamHeroId);
    }
    setNextFixtureHeroUrl(hero);
    setLoadingFixture(false);
  };

  const triggerFeedFetch = useCallback(
    async (source: 'focus' | 'refresh') => {
      console.log('[HOME] feed fetch trigger', { source });
      await fetchPosts();
      console.log('[HOME] feed fetch success', { source });
    },
    [fetchPosts],
  );

  useFocusEffect(
    React.useCallback(() => {
      loadNextFixture();

      if (nextFixture?.id) {
        void nextMatchAttendanceRefresh();
        void nextMatchCheckInRefresh();
      }

      // Refresh feed when returning from other screens (e.g. after creating an event)
      const now = Date.now();
      const elapsed = now - lastFocusFetchRef.current;
      if (elapsed >= 2000) {
        lastFocusFetchRef.current = now;
        void triggerFeedFetch('focus');
      }

      // Pause video when screen loses focus (navigation blur)
      return () => {
        setCurrentPlayingVideoPostId(null);
      };
    }, [nextFixture?.id, nextMatchAttendanceRefresh, nextMatchCheckInRefresh, triggerFeedFetch]),
  );

  useEffect(() => {
    if (!nextFixture?.id) return;
    void nextMatchAttendanceRefresh();
    void nextMatchCheckInRefresh();
  }, [nextFixture?.id, nextMatchAttendanceRefresh, nextMatchCheckInRefresh]);

  const handlePressFanActivity = useCallback(
    (item: FeedFanActivityData) => {
      if (item.parentType === 'match') {
        (navigation as any).navigate('MatchDetails', {
          fixtureId: item.parentId,
          fanActivityId: item.id,
        });
        return;
      }

      const parentNavigation = navigation.getParent?.();
      if (parentNavigation) {
        (parentNavigation as any).navigate('Events', {
          screen: 'EventDetails',
          params: {
            eventId: item.parentId,
            fanActivityId: item.id,
          },
        });
        return;
      }

      (navigation as any).navigate('Events', {
        screen: 'EventDetails',
        params: {
          eventId: item.parentId,
          fanActivityId: item.id,
        },
      });
    },
    [navigation],
  );

  const renderFeedItem = ({ item, index }: { item: any; index: number }) => {
    if (!item?.kind || !item?.id || !item?.data) {
      console.warn('[HOME] invalid item skipped', {
        index,
        hasKind: Boolean(item?.kind),
        hasId: Boolean(item?.id),
        hasData: Boolean(item?.data),
      });
      return null;
    }

    const key = getFeedItemKey(item);
    console.log('[HOME] rendering item', { index, key, kind: item.kind, id: item.id });
    const likeState = safeLikeMap[key] || { liked: false, likes: 0 };
    const commentCount = safeCommentCountMap[key] || 0;
    const commentPreviews = safeCommentPreviewMap[key] || [];
    const isActiveVideo = key === currentPlayingVideoPostId;
    const spacingCompensation = getHomeFeedItemSpacingCompensation(item.kind);

    return (
      <View style={spacingCompensation ? { marginBottom: -spacingCompensation } : undefined}>
        <FeedItemRenderer
          key={key}
          item={item}
          itemKey={key}
          user={user}
          isAppAdmin={isAppAdmin}
          likeState={likeState}
          commentCount={commentCount}
          commentPreviews={commentPreviews}
          safeProfileMap={safeProfileMap}
          communityMap={communityMap || {}}
          // @ts-ignore
          attendanceMap={attendanceMap}
          toggleLike={toggleLike}
          removePost={removePost}
          removeNews={removeNews}
          incrementCommentCount={incrementCommentCount}
          addCommentPreview={addCommentPreview}
          isActiveVideo={isActiveVideo}
          isAppActive={isAppActive}
          onActivateVideo={() => setCurrentPlayingVideoPostId(key)}
          onPressEvent={(eventId) => (navigation as any).navigate('EventDetails', { eventId })}
          onPressBusTrip={(busTripId) =>
            (navigation as any).navigate('BusTripDetails', { busTripId })
          }
          onPressMatch={(matchId) =>
            (navigation as any).navigate('MatchDetails', { fixtureId: matchId })
          }
          onPressFanActivity={handlePressFanActivity}
          onPressCommunity={(communityId, title) =>
            (navigation as any).navigate('Communities', {
              screen: 'CommunityDetail',
              params: { id: communityId, title },
            })
          }
          onPressProfile={(userId) =>
            userId === user?.id
              ? (navigation as any).navigate('Profile')
              : (navigation as any).navigate('PublicProfile', { userId })
          }
          onPressPost={(postId) => (navigation as any).navigate('PostDetail', { postId })}
        />
      </View>
    );
  };

  // Map nextFixture to matchForBadge for NextMatchBadge
  const matchForBadge = useMemo(
    () =>
      nextFixture && nextFixtureHeroUrl
        ? {
            id: nextFixture.id,
            coverUrl: nextFixtureHeroUrl,
            homeTeam: nextFixture.home_team,
            awayTeam: nextFixture.away_team,
            homeLogo: nextFixture.home_logo_url ?? null,
            awayLogo: nextFixture.away_logo_url ?? null,
            kickoff: nextFixture.kickoff_at ?? '',
            venue: nextFixture.venue ?? null,
            venueCity: nextFixture.venue_city ?? null,
            title: `${nextFixture.home_team} vs ${nextFixture.away_team}`,
            subtitle: nextFixture.kickoff_at ? formatShortDateDa(nextFixture.kickoff_at) : '',
          }
        : null,
    [nextFixture, nextFixtureHeroUrl],
  );

  useEffect(() => {
    if (!matchForBadge) return;

    console.log('[HOME][MATCH] badge render', {
      fixtureId: matchForBadge.id,
      hasHero: Boolean(matchForBadge.coverUrl),
      hasHomeLogo: Boolean(matchForBadge.homeLogo),
      hasAwayLogo: Boolean(matchForBadge.awayLogo),
    });
  }, [matchForBadge]);

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
  const nextMatchFansOverview = useMemo(() => {
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
        item: {
          userId: string;
          displayName: string | null;
          avatarUrl: string | null;
          status: 'checkin' | 'attendance';
        };
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

  const nextMatchViewState = nextMatchUiModel?.viewState ?? 'pre_match';
  const nextMatchPanelCount = nextMatchUiModel?.socialCount ?? 0;
  const nextMatchPanelAvatars = nextMatchUiModel?.socialAvatars ?? [];
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
  }, [nextMatchUiModel?.effectiveIsGoing, nextMatchUiModel?.previewMode, nextMatchViewState]);
  const nextMatchSocialCopyOverride = useMemo(() => {
    if (nextMatchViewState === 'matchday_action' || nextMatchViewState === 'checked_in_confirmed') {
      return buildCheckInSocialProof(
        nextMatchCheckIn.countCheckedIn,
      );
    }

    return undefined;
  }, [
    nextMatchCheckIn.countCheckedIn,
    nextMatchViewState,
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

  const handleOpenNextMatchCheckedInFans = useCallback(() => {
    if (!nextFixture?.id) return;
    (navigation as any).navigate('EventAttendees', {
      entityId: nextFixture.id,
      entityType: 'match',
      title: 'Tjekket ind på stadion',
      mode: 'checkin',
    });
  }, [navigation, nextFixture?.id]);

  const handleNextMatchPrimaryAction = useCallback(async () => {
    if (!nextFixture?.id) return;

    if (nextMatchViewState === 'matchday_action') {
      try {
        await nextMatchCheckIn.checkIn();
        return;
      } catch {
        return;
      }
    }

    if (nextMatchViewState === 'pre_match' && !nextMatchAttendance.isGoing) {
      try {
        await nextMatchAttendance.toggleGoing();
        return;
      } catch {
        return;
      }
    }
  }, [
    nextFixture?.id,
    nextMatchAttendance,
    nextMatchCheckIn,
    nextMatchViewState,
  ]);

  return (
    <FlatList
      data={safeHomeFeedItems}
      keyExtractor={(item) => getFeedItemKey(item)}
      renderItem={renderFeedItem}
      ItemSeparatorComponent={() => <View style={styles.feedSeparator} />}
      style={styles.container}
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            void triggerFeedFetch('refresh');
          }}
          tintColor={colors.fcnRed}
          colors={[colors.fcnRed]}
        />
      }
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      ListHeaderComponent={
        <>
          <AppHeader
            title="FC Nordsjælland"
            subtitle="Fan Fællesskab"
            onPressProfile={() => (navigation as any).navigate('Profile')}
          />
          {/* Next Match Hero Badge - Edge to edge */}
          {matchForBadge && (
            <NextMatchBadge
              match={matchForBadge}
              countdownLabel={nextMatchCountdownLabel ?? undefined}
              matchStatusPanel={{
                viewState: nextMatchViewState,
                isGoing: nextMatchUiModel?.effectiveIsGoing ?? nextMatchAttendance.isGoing,
                avatars: nextMatchPanelAvatars,
                count: nextMatchPanelCount,
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
          )}
          {loadingFixture && (
            <View style={[styles.content, { paddingTop: spacing.lg }]}>
              <Card style={styles.card}>
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Henter kampdata...</Text>
                </View>
              </Card>
            </View>
          )}
          {!loadingFixture && !nextFixture && (
            <View style={[styles.content, { paddingTop: spacing.lg }]}>
              <Card style={styles.card}>
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Ingen kommende kampe endnu</Text>
                  <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
                </View>
              </Card>
            </View>
          )}
        </>
      }
    />
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    feedSeparator: { height: defaultTheme.layout.listGap },
    content: { paddingHorizontal: spacing[0], paddingVertical: spacing.md },
    card: { marginBottom: spacing.md },
    loadingContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    loadingText: { fontSize: 14, color: colors.subtext },
    emptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
    emptySubtext: { fontSize: 14, color: colors.subtext },
  });




