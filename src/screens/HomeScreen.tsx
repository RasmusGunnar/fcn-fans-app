import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { FanFactionCard } from '../components/cards/FanFactionCard';
import { useFeed } from '../state/FeedContext';
import { useAuth } from '../auth/AuthProvider';
import { colors, spacing, defaultTheme as theme } from '../theme';
import { getFeedItemKey } from '../types/feed';
import {
  fetchNextFixture,
  formatShortDateDa,
  formatTime,
  type Fixture,
} from '../services/fixtures';

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

  // Defensive: Ensure feedItems is always an array and filter out any falsy values
  const safeFeedItems = (Array.isArray(feedItems) ? feedItems : []).filter(Boolean);

  // Ensure all maps have safe defaults
  const safeProfileMap = profileMap || {};
  const safeLikeMap = likeMap || {};
  const safeCommentCountMap = commentCountMap || {};
  const safeCommentPreviewMap = commentPreviewMap || {};

  // Debug logging for testing
  if (__DEV__) {
    console.log('[HomeScreen]', { userId: user?.id, isAppAdmin });
    console.log('[HomeScreen] feedItems type', {
      isArray: Array.isArray(feedItems),
      value: feedItems ? 'defined' : 'undefined',
      length: safeFeedItems.length,
    });

    // Log first item's data
    if (safeFeedItems.length > 0) {
      const firstItem = safeFeedItems[0];
      const firstKey = getFeedItemKey(firstItem);
      console.log('[HomeScreen] First item render data:', {
        key: firstKey,
        kind: firstItem.kind,
        commentCount: safeCommentCountMap[firstKey],
        previewCount: safeCommentPreviewMap[firstKey]?.length || 0,
        hasLikeData: !!safeLikeMap[firstKey],
      });
    }
  }

  const loadNextFixture = async () => {
    setLoadingFixture(true);
    const fixture = await fetchNextFixture();
    setNextFixture(fixture);
    setLoadingFixture(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useFocusEffect(
    React.useCallback(() => {
      loadNextFixture();
    }, []),
  );

  useEffect(() => {
    if (__DEV__ && safeFeedItems.length > 0) {
      console.log('[HomeScreen] Feed items loaded:', {
        totalCount: safeFeedItems.length,
        posts: safeFeedItems.filter((item) => item.kind === 'post').length,
        news: safeFeedItems.filter((item) => item.kind === 'news').length,
      });
    }
  }, [safeFeedItems]);

  const [factionLiked, setFactionLiked] = useState(false);
  const [factionLikes, setFactionLikes] = useState(7);

  const toggleFactionLike = () => {
    setFactionLiked(!factionLiked);
    setFactionLikes(factionLiked ? factionLikes - 1 : factionLikes + 1);
  };

  return (
    <ScrollView
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
    >
      <AppHeader
        title="FC Nordsjælland"
        subtitle="Fan Fællesskab"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />
      <View style={styles.content}>
        <Card style={styles.card}>
          <Pill label="Næste Kamp" />
          {loadingFixture ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Henter kampdata...</Text>
            </View>
          ) : nextFixture ? (
            <>
              <View style={styles.matchRow}>
                <View style={styles.team}>
                  {nextFixture.home_logo_url ? (
                    <Image source={{ uri: nextFixture.home_logo_url }} style={styles.teamLogo} />
                  ) : (
                    <View style={styles.teamCircle}>
                      <Text style={styles.teamText}>
                        {nextFixture.home_team.substring(0, 3).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.teamName}>{nextFixture.home_team}</Text>
                </View>
                <Text style={styles.vs}>VS</Text>
                <View style={styles.team}>
                  {nextFixture.away_logo_url ? (
                    <Image source={{ uri: nextFixture.away_logo_url }} style={styles.teamLogo} />
                  ) : (
                    <View style={styles.teamCircle}>
                      <Text style={styles.teamText}>
                        {nextFixture.away_team.substring(0, 3).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.teamName}>{nextFixture.away_team}</Text>
                </View>
              </View>
              <View style={styles.matchDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.icon}></Text>
                  <Text style={styles.detailText}>
                    {formatShortDateDa(nextFixture.kickoff_at)}, kl.{' '}
                    {formatTime(nextFixture.kickoff_at)}
                  </Text>
                </View>
                {nextFixture.venue && (
                  <View style={styles.detailRow}>
                    <Text style={styles.icon}></Text>
                    <Text style={styles.detailText}>
                      {nextFixture.venue}
                      {nextFixture.venue_city ? `, ${nextFixture.venue_city}` : ''}
                    </Text>
                  </View>
                )}
                {nextFixture.competition && (
                  <View style={styles.detailRow}>
                    <Text style={styles.icon}></Text>
                    <Text style={styles.detailText}>
                      {nextFixture.competition}
                      {nextFixture.round ? ` - ${nextFixture.round}` : ''}
                    </Text>
                  </View>
                )}
              </View>
              <PrimaryButton
                title="Se detaljer"
                onPress={() =>
                  (navigation as any).navigate('MatchDetails', { fixtureId: nextFixture.id })
                }
              />
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Ingen kommende kampe endnu</Text>
              <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
            </View>
          )}
        </Card>

        {/* Render combined feed (posts + news) */}
        {safeFeedItems.map((item) => {
          const key = getFeedItemKey(item);
          const likeState = safeLikeMap[key] || { liked: false, likes: 0 };
          const commentCount = safeCommentCountMap[key] || 0;
          const commentPreviews = safeCommentPreviewMap[key] || [];

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
            />
          );
        })}

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
    </ScrollView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing[0], paddingVertical: spacing.md },
    card: { marginBottom: spacing.md },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: spacing.lg,
    },
    team: { alignItems: 'center', flex: 1 },
    teamCircle: {
      width: 60,
      height: 60,
      borderRadius: theme.radius.pill,
      backgroundColor: colors.fcnRed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    teamLogo: { width: 60, height: 60, borderRadius: theme.radius.pill },
    teamName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    teamText: { color: colors.card, fontSize: 16, fontWeight: '700' },
    loadingContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    loadingText: { fontSize: 14, color: colors.subtext },
    emptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
    emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
    emptySubtext: { fontSize: 14, color: colors.subtext },
    vs: { fontSize: 18, fontWeight: '700', color: colors.text, marginHorizontal: spacing.md },
    matchDetails: { marginBottom: spacing.lg },
    detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    icon: { fontSize: 16, marginRight: spacing.sm },
    detailText: { fontSize: 14, color: colors.subtext },
  });
