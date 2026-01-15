import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { CommunityCard } from '../components/cards/CommunityCard';
import { EventCard } from '../components/cards/EventCard';
import { NewsCard } from '../components/cards/NewsCard';
import { FanPostCard } from '../components/cards/FanPostCard';
import { FanFactionCard } from '../components/cards/FanFactionCard';
import { CardActions } from '../components/cards/CardActions';
import { useFeed } from '../state/FeedContext';
import { colors, spacing } from '../theme';

export default function HomeScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { posts, fetchPosts, loading } = useFeed();

  // Fetch posts from Supabase on mount
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Debug: Log posts from feed on render
  useEffect(() => {
    if (__DEV__ && posts.length > 0) {
      const firstPost = posts[0];
      console.log('[HomeScreen] Posts loaded from feed:', {
        totalCount: posts.length,
        firstPostId: firstPost.id,
        firstPostAuthor: firstPost.authorName,
        firstPostHasMedia: !!firstPost.media,
      });
    }
  }, [posts]);
  const [matchLiked, setMatchLiked] = useState(false);
  const [matchLikes, setMatchLikes] = useState(42);

  const [communityLiked, setCommunityLiked] = useState(false);
  const [communityLikes, setCommunityLikes] = useState(15);

  const [eventLiked, setEventLiked] = useState(false);
  const [eventLikes, setEventLikes] = useState(8);

  const [newsLiked, setNewsLiked] = useState(false);
  const [newsLikes, setNewsLikes] = useState(23);

  const postLikeStates = posts.reduce((acc, post) => {
    acc[post.id] = { liked: false, likes: post.likesCount };
    return acc;
  }, {} as Record<string, { liked: boolean; likes: number }>);

  const [postLikes, setPostLikes] = useState(postLikeStates);

  const togglePostLike = (postId: string) => {
    setPostLikes((prev) => ({
      ...prev,
      [postId]: {
        liked: !prev[postId].liked,
        likes: prev[postId].liked ? prev[postId].likes - 1 : prev[postId].likes + 1,
      },
    }));
  };

  const [factionLiked, setFactionLiked] = useState(false);
  const [factionLikes, setFactionLikes] = useState(7);

  const toggleMatchLike = () => {
    setMatchLiked(!matchLiked);
    setMatchLikes(matchLiked ? matchLikes - 1 : matchLikes + 1);
  };

  const toggleCommunityLike = () => {
    setCommunityLiked(!communityLiked);
    setCommunityLikes(communityLiked ? communityLikes - 1 : communityLikes + 1);
  };

  const toggleEventLike = () => {
    setEventLiked(!eventLiked);
    setEventLikes(eventLiked ? eventLikes - 1 : eventLikes + 1);
  };

  const toggleNewsLike = () => {
    setNewsLiked(!newsLiked);
    setNewsLikes(newsLiked ? newsLikes - 1 : newsLikes + 1);
  };

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
          <View style={styles.matchRow}>
            <View style={styles.team}>
              <View style={styles.teamCircle}>
                <Text style={styles.teamText}>FCN</Text>
              </View>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={styles.team}>
              <View style={styles.teamCircle}>
                <Text style={styles.teamText}>MOD</Text>
              </View>
            </View>
          </View>
          <View style={styles.matchDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.icon}>📅</Text>
              <Text style={styles.detailText}>Lørdag 18. januar 2025</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.icon}>🏟️</Text>
              <Text style={styles.detailText}>Right to Dream Park</Text>
            </View>
          </View>
          <PrimaryButton title="Se detaljer" onPress={() => {}} />
          <CardActions
            liked={matchLiked}
            likes={matchLikes}
            comments={5}
            onToggleLike={toggleMatchLike}
            onPressComment={() => console.log('Match comment')}
            onPressShare={() => console.log('Match share')}
          />
        </Card>

        <CommunityCard
          name="Farum Fans"
          members={156}
          timeAgo="2 timer siden"
          description="Velkommen til Farum Fans! Vi er en lokal gruppe dedikerede FCN-fans fra Farum-området. Vi arrangerer fælles busture til kampe og sociale arrangementer."
          liked={communityLiked}
          likes={communityLikes}
          comments={3}
          onToggleLike={toggleCommunityLike}
          onPressComment={() => console.log('Community comment')}
          onPressShare={() => console.log('Community share')}
          onPressJoin={() => console.log('Navigate to Community')}
        />

        <EventCard
          title="Bustur til Silkeborg"
          date="Lørdag 18. januar 2025, 14:00"
          location="Afgang fra Farum Station"
          spotsLeft={12}
          liked={eventLiked}
          likes={eventLikes}
          comments={2}
          onToggleLike={toggleEventLike}
          onPressComment={() => console.log('Event comment')}
          onPressShare={() => console.log('Event share')}
          onPressBook={() => console.log('Book event')}
        />

        <NewsCard
          headline="FCN forbereder sig til vigtig kamp mod Silkeborg"
          snippet="Cheftræner Flemming Pedersen har udtalt, at holdet er klar til at tage imod Silkeborg IF i en kamp, der kan blive afgørende for sæsonen."
          source="Bold.dk"
          timeAgo="45 min siden"
          liked={newsLiked}
          likes={newsLikes}
          comments={7}
          onToggleLike={toggleNewsLike}
          onPressComment={() => console.log('News comment')}
          onPressShare={() => console.log('News share')}
          onPressRead={() => console.log('Read article')}
        />

        {posts.map((post) => (
          <FanPostCard
            key={post.id}
            post={post}
            liked={postLikes[post.id]?.liked || false}
            onToggleLike={() => togglePostLike(post.id)}
            onPressComment={() => console.log('Fan post comment')}
            onPressShare={() => console.log('Fan post share')}
          />
        ))}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
  },
  card: {
    marginBottom: spacing.md,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  team: {
    alignItems: 'center',
  },
  teamCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  vs: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.md,
  },
  matchDetails: {
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: colors.subtext,
  },
});
