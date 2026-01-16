import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { MatchCard } from '../components/events/MatchCard';
import { BusTripCard } from '../components/events/BusTripCard';
import { EventCard as GenericEventCard } from '../components/events/EventCard';
import { fetchFeedUpcoming, type FeedItem } from '../services/eventsApi';
import { colors, spacing } from '../theme';

export default function EventsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = async () => {
    const items = await fetchFeedUpcoming();
    setFeed(items);
    setLoading(false);

    if (__DEV__) {
      const counts = items.reduce(
        (acc, item) => {
          acc[item.kind === 'match' ? 'matches' : item.kind === 'bus_trip' ? 'busTrips' : 'events']++;
          return acc;
        },
        { matches: 0, busTrips: 0, events: 0 }
      );
      console.log('[EventsScreen] feed counts', { ...counts, total: items.length });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  };

  useEffect(() => {
    loadFeed();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadFeed();
    }, [])
  );

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.kind === 'match') {
      return (
        <MatchCard
          home={item.home}
          away={item.away}
          homeLogo={item.homeLogo}
          awayLogo={item.awayLogo}
          kickoffAt={item.kickoffAt}
          venue={item.venue}
          venueCity={item.venueCity}
          competition={item.competition}
          round={item.round}
          onPress={() =>
            (navigation as any).navigate('MatchDetails', { fixtureId: item.id })
          }
        />
      );
    }

    if (item.kind === 'bus_trip') {
      return (
        <BusTripCard
          title={item.title}
          startAt={item.startAt}
          departurePlace={item.departurePlace}
          seatsLeft={item.seatsLeft}
          totalSeats={item.totalSeats}
          priceDkk={item.priceDkk}
          organizerName={item.organizerName}
          onPress={() =>
            (navigation as any).navigate('BusTripDetails', { busTripId: item.id })
          }
        />
      );
    }

    if (item.kind === 'event') {
      return (
        <GenericEventCard
          title={item.title}
          startAt={item.startAt}
          location={item.location}
          organizerName={item.organizerName}
          description={item.description}
          onPress={() =>
            (navigation as any).navigate('EventDetails', { eventId: item.id })
          }
        />
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Events & Busture"
        subtitle="Kommende kampe og rejser"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
          <Text style={styles.loadingText}>Henter events...</Text>
        </View>
      ) : (
        <FlatList
          data={feed}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: tabBarHeight + spacing.lg,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.fcnRed}
              colors={[colors.fcnRed]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>Ingen kommende events</Text>
              <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.subtext,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.subtext,
  },
});