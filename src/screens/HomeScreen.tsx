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
import { FanFactionCard } from '../components/cards/FanFactionCard';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { Card } from '../components/ui/Card';
import NextMatchBadge from '../components/home/NextMatchBadge';
import {
  fetchNextFixture,
  formatShortDateDa,
  formatTime,
  type Fixture,
} from '../services/fixtures';
import { useFeed } from '../state/FeedContext';
import { colors, spacing } from '../theme';
import { getFeedItemKey } from '../types/feed';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';

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

  // Rate-limit focus refetches (skip if last fetch was < 5 s ago)
  const lastFocusFetchRef = useRef<number>(0);

  // Defensive: Ensure feedItems is always an array and filter out any falsy values
  const safeFeedItems = (Array.isArray(feedItems) ? feedItems : []).filter(Boolean);

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
    }, [fetchPosts]),
  );

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
  const matchForBadge = nextFixture && nextFixtureHeroUrl
    ? {
        coverUrl: nextFixtureHeroUrl,
        title: `${nextFixture.home_team} vs ${nextFixture.away_team}`,
        subtitle: nextFixture.kickoff_at
          ? formatShortDateDa(nextFixture.kickoff_at)
          : '',
      }
    : null;

  return (
    <FlatList
      data={safeFeedItems}
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
            title="FC Nordsjælland"
            subtitle="Fan Fællesskab"
            onPressProfile={() => (navigation as any).navigate('Profile')}
          />
          {/* Next Match Hero Badge - Edge to edge */}
          {matchForBadge && (
            <NextMatchBadge
              match={matchForBadge}
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
            description="FCN's mest passionerede fans. Vi støtter holdet gennem tykt og tyndt med sang, flag og uforbeholden støtte."
            liked={factionLiked}
            likes={factionLikes}
            comments={1}
            onToggleLike={toggleFactionLike}
            onPressComment={() => console.log('Faction comment')}
            onPressShare={() => console.log('Faction share')}
            onPressJoin={() => console.log('Navigate to Faction')}
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
