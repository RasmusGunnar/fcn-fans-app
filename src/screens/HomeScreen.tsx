import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { FanFactionCard } from '../components/cards/FanFactionCard';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import NextMatchBadge from '../components/home/NextMatchBadge';
import { Card } from '../components/ui/Card';
import { useAttendance } from '../hooks/useAttendance';
import { useMatchCheckIn } from '../hooks/useMatchCheckIn';
import { fetchNextFixture, formatShortDateDa, type Fixture } from '../services/fixtures';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { useFeed } from '../state/FeedContext';
import { colors, spacing } from '../theme';
import { getFeedItemKey } from '../types/feed';
import { buildMatchMapsUrl, FCN_TICKET_URL, isFcnHomeMatch } from '../utils/matchLinks';
import { getMatchdayTiming, getMatchViewState } from '../utils/matchdayState';
import { applyMatchdayPreview } from '../utils/matchdayPreview';

function formatKickoffCountdown(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart';
  if (diffHours < 48) return `Afspark om ${Math.ceil(diffHours)} timer`;
  return `Afspark om ${Math.ceil(diffHours / 24)} dage`;
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, isAppAdmin } = useAuth();
  const styles = createStyles();
  const {
    feedItems,
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

  // Defensive: Ensure feedItems is always an array and filter out any falsy values
  const safeFeedItems = (Array.isArray(feedItems) ? feedItems : []).filter(Boolean);
  const homeFeedItems = safeFeedItems.filter((item) => {
    if (item.kind !== 'post') return true;
    const post = item.data as any;
    const feedTargets = Array.isArray(post.feedTargets) ? post.feedTargets : [];
    return feedTargets.includes('home') || feedTargets.length === 0;
  });

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
        return post?.media?.[0]?.type === 'video';
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
    const fixture = await fetchNextFixture();
    setNextFixture(fixture);
    // Resolve hero: try raw first, then team API
    let hero = getMatchHeroUrl(fixture as any);
    if (!hero && fixture?.home_team_provider_id) {
      hero = await getTeamHeroImage(fixture.home_team_provider_id);
    }
    setNextFixtureHeroUrl(hero);
    setLoadingFixture(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

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
        fetchPosts();
      }

      // Pause video when screen loses focus (navigation blur)
      return () => {
        setCurrentPlayingVideoPostId(null);
      };
    }, [fetchPosts, nextFixture?.id, nextMatchAttendanceRefresh, nextMatchCheckInRefresh]),
  );

  useEffect(() => {
    if (!nextFixture?.id) return;
    void nextMatchAttendanceRefresh();
    void nextMatchCheckInRefresh();
  }, [nextFixture?.id, nextMatchAttendanceRefresh, nextMatchCheckInRefresh]);

  const [factionLiked, setFactionLiked] = useState(false);
  const [factionLikes, setFactionLikes] = useState(7);

  const toggleFactionLike = () => {
    setFactionLiked(!factionLiked);
    setFactionLikes(factionLiked ? factionLikes - 1 : factionLikes + 1);
  };

  const renderFeedItem = ({ item }: { item: any }) => {
    const key = getFeedItemKey(item);
    const likeState = safeLikeMap[key] || { liked: false, likes: 0 };
    const commentCount = safeCommentCountMap[key] || 0;
    const commentPreviews = safeCommentPreviewMap[key] || [];
    const isActiveVideo = key === currentPlayingVideoPostId;

    return (
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
      />
    );
  };

  // Map nextFixture to matchForBadge for NextMatchBadge
  const matchForBadge =
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
      : null;

  const nextMatchCountdownLabel = useMemo(() => {
    if (!nextFixture?.kickoff_at) return null;
    return formatKickoffCountdown(nextFixture.kickoff_at, now);
  }, [nextFixture?.kickoff_at, now]);

  const nextMatchdayState = useMemo(() => {
    if (!nextFixture?.kickoff_at) return { diffHours: Infinity, isMatchday: false, isLive: false };
    return applyMatchdayPreview(getMatchdayTiming(nextFixture.kickoff_at, now));
  }, [nextFixture?.kickoff_at, now]);

  const nextMatchViewState = useMemo(
    () =>
      getMatchViewState({
        isMatchday: nextMatchdayState.isMatchday,
        isGoing: nextMatchAttendance.isGoing,
        isCheckedIn: nextMatchCheckIn.isCheckedIn,
      }),
    [nextMatchAttendance.isGoing, nextMatchCheckIn.isCheckedIn, nextMatchdayState.isMatchday],
  );

  const nextMatchPanelCount =
    nextMatchViewState === 'pre_match'
      ? nextMatchAttendance.countGoing
      : nextMatchCheckIn.countCheckedIn;
  const nextMatchPanelAvatars =
    nextMatchViewState === 'pre_match' ? nextMatchAttendance.avatars : nextMatchCheckIn.avatars;
  const nextMatchPrimaryLabel =
    nextMatchViewState === 'checked_in_confirmed'
      ? undefined
      : nextMatchViewState === 'matchday_action'
        ? nextMatchCheckIn.loading
          ? 'Tjekker ind...'
          : 'Tjek ind'
        : nextMatchAttendance.isGoing
          ? 'Du kommer'
          : 'Jeg kommer';
  const nextMatchPrimaryDisabled =
    nextMatchViewState === 'checked_in_confirmed'
      ? true
      : nextMatchViewState === 'matchday_action'
        ? nextMatchCheckIn.loading
        : nextMatchAttendance.isGoing || nextMatchAttendance.loading;
  const nextMatchMapsUrl = useMemo(
    () => (nextFixture ? buildMatchMapsUrl(nextFixture) : null),
    [nextFixture],
  );
  const canBuyNextMatchTicket = Boolean(nextFixture && isFcnHomeMatch(nextFixture));

  const handleOpenNextMatch = useCallback(() => {
    if (!matchForBadge) return;
    (navigation as any).navigate('MatchDetails', { fixtureId: matchForBadge.id });
  }, [matchForBadge, navigation]);

  const handleOpenNextMatchAttendees = useCallback(() => {
    if (!nextFixture?.id) return;
    (navigation as any).navigate('EventAttendees', {
      entityId: nextFixture.id,
      entityType: 'match',
      title: 'Fans der kommer',
    });
  }, [navigation, nextFixture?.id]);

  const handleOpenNextMatchCheckedInFans = useCallback(() => {
    if (!nextFixture?.id) return;
    (navigation as any).navigate('EventAttendees', {
      entityId: nextFixture.id,
      entityType: 'match',
      title: 'Tjekket ind p\u00e5 stadion',
      mode: 'checkin',
    });
  }, [navigation, nextFixture?.id]);

  const handleOpenNextMatchTickets = useCallback(async () => {
    if (!canBuyNextMatchTicket) return;

    try {
      await Linking.openURL(FCN_TICKET_URL);
    } catch {
      Alert.alert('Fejl', 'Kunne ikke \u00e5bne billetsiden.');
    }
  }, [canBuyNextMatchTicket]);

  const handleOpenNextMatchRoute = useCallback(async () => {
    if (!nextMatchMapsUrl) return;

    try {
      await Linking.openURL(nextMatchMapsUrl);
    } catch {
      Alert.alert('Fejl', 'Kunne ikke \u00e5bne kortet.');
    }
  }, [nextMatchMapsUrl]);

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

  const nextMatchSecondaryActions =
    nextMatchViewState === 'matchday_action' || nextMatchViewState === 'checked_in_confirmed'
      ? [
          {
            label: 'Se kampdetaljer',
            icon: 'arrow-forward-circle-outline' as const,
            onPress: handleOpenNextMatch,
            disabled: false,
          },
          {
            label: 'Vejvisning',
            icon: 'navigate-outline' as const,
            onPress: handleOpenNextMatchRoute,
            disabled: !nextMatchMapsUrl,
          },
        ]
      : [
          {
            label: 'K\u00f8b billet',
            icon: 'ticket-outline' as const,
            onPress: handleOpenNextMatchTickets,
            disabled: !canBuyNextMatchTicket,
          },
          {
            label: 'Vejvisning',
            icon: 'navigate-outline' as const,
            onPress: handleOpenNextMatchRoute,
            disabled: !nextMatchMapsUrl,
          },
        ];

  return (
    <FlatList
      data={homeFeedItems}
      keyExtractor={(item) => getFeedItemKey(item)}
      renderItem={renderFeedItem}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={fetchPosts}
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
            title="FC Nordsj\u00e6lland"
            subtitle="Fan F\u00e6llesskab"
            onPressProfile={() => (navigation as any).navigate('Profile')}
          />
          {/* Next Match Hero Badge - Edge to edge */}
          {matchForBadge && (
            <NextMatchBadge
              match={matchForBadge}
              countdownLabel={nextMatchCountdownLabel ?? undefined}
              matchStatusPanel={{
                viewState: nextMatchViewState,
                isGoing: nextMatchAttendance.isGoing,
                avatars: nextMatchPanelAvatars,
                count: nextMatchPanelCount,
                primaryLabel: nextMatchPrimaryLabel,
                primaryDisabled: nextMatchPrimaryDisabled,
                secondaryActions: nextMatchSecondaryActions
              }}
              onPress={handleOpenNextMatch}
              onPressPrimaryAction={handleNextMatchPrimaryAction}
              onPressSocial={
                nextMatchViewState === 'pre_match'
                  ? handleOpenNextMatchAttendees
                  : handleOpenNextMatchCheckedInFans
              }
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
      ListFooterComponent={
        <View style={styles.content}>
          <FanFactionCard
            name="Ultras FCN"
            members={89}
            timeAgo="1 time siden"
            description="FCN's mest passionerede fans. Vi st\u00f8tter holdet gennem tykt og tyndt med sang, flag og uforbeholden st\u00f8tte."
            liked={factionLiked}
            likes={factionLikes}
            comments={1}
            onToggleLike={toggleFactionLike}
            onPressComment={() => {}}
            onPressShare={() => {}}
            onPressJoin={() => {}}
          />
        </View>
      }
    />
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing[0], paddingVertical: spacing.md },
    card: { marginBottom: spacing.md },
    loadingContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    loadingText: { fontSize: 14, color: colors.subtext },
    emptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
    emptySubtext: { fontSize: 14, color: colors.subtext },
  });



