import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import MapView, { Marker, Region } from 'react-native-maps';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppHeader } from '../components/AppHeader';
import { MatchCard } from '../components/events/MatchCard';
import { BusTripCard } from '../components/events/BusTripCard';
import { EventCard as GenericEventCard } from '../components/events/EventCard';
import { MapMarkerIcon } from '../components/MapMarkerIcon';
import { fetchFeedUpcoming, type FeedItem } from '../services/eventsApi';
import { colors, spacing } from '../theme';

type ViewMode = 'list' | 'map';
type FilterMode = 'all' | 'matches' | 'events';

// Normalized map item type
type MapItem = {
  id: string;
  kind: 'match' | 'event';
  title: string;
  datetime: string;
  lat: number;
  lng: number;
  subtitle?: string;
  venue?: string;
  logoUrl?: string | null;
  feedItem: FeedItem; // Keep original for navigation
};

const FARUM_REGION: Region = {
  latitude: 55.8,
  longitude: 12.36,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export default function EventsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);

  const snapPoints = useMemo(() => ['20%', '45%', '85%'], []);

  const loadFeed = async () => {
    const items = await fetchFeedUpcoming();
    setFeed(items);
    setLoading(false);

    if (__DEV__) {
      const counts = items.reduce(
        (acc, item) => {
          acc[
            item.kind === 'match' ? 'matches' : item.kind === 'bus_trip' ? 'busTrips' : 'events'
          ]++;
          return acc;
        },
        { matches: 0, busTrips: 0, events: 0 },
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
    }, []),
  );

  // Filter feed based on filter chips
  const filteredFeed = feed.filter((item) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'matches') return item.kind === 'match';
    if (filterMode === 'events') return item.kind === 'event' || item.kind === 'bus_trip';
    return true;
  });

  // Convert filtered feed to map items (only items with lat/lng)
  const mapItems: MapItem[] = filteredFeed
    .map((item): MapItem | null => {
      if (item.kind === 'match') {
        // Match needs lat/lng from fixtures table
        const lat = (item as any).lat;
        const lng = (item as any).lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        return {
          id: item.id,
          kind: 'match',
          title: `${item.home} - ${item.away}`,
          datetime: item.kickoffAt,
          lat,
          lng,
          venue: item.venue || undefined,
          subtitle: item.venue || item.venueCity || undefined,
          logoUrl: item.homeLogo,
          feedItem: item,
        };
      }

      if (item.kind === 'event') {
        // Event needs lat/lng from events table
        const lat = (item as any).lat;
        const lng = (item as any).lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        return {
          id: item.id,
          kind: 'event',
          title: item.title,
          datetime: item.startAt,
          lat,
          lng,
          subtitle: item.location || undefined,
          logoUrl: null,
          feedItem: item,
        };
      }

      // Bus trips don't have their own location, skip for now
      return null;
    })
    .filter((item): item is MapItem => item !== null);

  const renderListItem = ({ item }: { item: FeedItem }) => {
    if (item.kind === 'match') {
      return (
        <MatchCard
          matchId={item.id}
          home={item.home}
          away={item.away}
          homeLogo={item.homeLogo}
          awayLogo={item.awayLogo}
          kickoffAt={item.kickoffAt}
          venue={item.venue}
          venueCity={item.venueCity}
          competition={item.competition}
          round={item.round}
          onPress={() => (navigation as any).navigate('MatchDetails', { fixtureId: item.id })}
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
          onPress={() => (navigation as any).navigate('BusTripDetails', { busTripId: item.id })}
        />
      );
    }

    if (item.kind === 'event') {
      return (
        <GenericEventCard
          eventId={item.id}
          title={item.title}
          startAt={item.startAt}
          location={item.location}
          organizerName={item.organizerName}
          description={item.description}
          onPress={() => (navigation as any).navigate('EventDetails', { eventId: item.id })}
        />
      );
    }

    return null;
  };

  const handleMarkerPress = useCallback((item: MapItem) => {
    setSelectedItem(item);
    bottomSheetRef.current?.snapToIndex(1); // Open to 45%
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      // Sheet closed
      setSelectedItem(null);
    }
  }, []);

  const handleBottomSheetCTA = useCallback(() => {
    if (!selectedItem) return;

    if (selectedItem.kind === 'match') {
      (navigation as any).navigate('MatchDetails', { fixtureId: selectedItem.id });
    } else if (selectedItem.kind === 'event') {
      (navigation as any).navigate('EventDetails', { eventId: selectedItem.id });
    }

    bottomSheetRef.current?.close();
    setSelectedItem(null);
  }, [selectedItem, navigation]);

  // Fit map to markers on mount
  useEffect(() => {
    if (viewMode === 'map' && mapItems.length > 0 && mapRef.current) {
      const coordinates = mapItems.map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
      }));

      // Add a small delay to ensure map is mounted
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 300, left: 50 },
          animated: true,
        });
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, mapItems.length]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <AppHeader
        title="Events & Kampe"
        subtitle="Kommende events"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.chip, filterMode === 'all' && styles.chipActive]}
          onPress={() => setFilterMode('all')}
        >
          <Text style={[styles.chipText, filterMode === 'all' && styles.chipTextActive]}>
            Alle
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chip, filterMode === 'matches' && styles.chipActive]}
          onPress={() => setFilterMode('matches')}
        >
          <Text style={[styles.chipText, filterMode === 'matches' && styles.chipTextActive]}>
            Kampe
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chip, filterMode === 'events' && styles.chipActive]}
          onPress={() => setFilterMode('events')}
        >
          <Text style={[styles.chipText, filterMode === 'events' && styles.chipTextActive]}>
            Events
          </Text>
        </TouchableOpacity>
      </View>

      {/* View Mode Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>
            📋 Liste
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'map' && styles.toggleButtonActive]}
          onPress={() => setViewMode('map')}
        >
          <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>
            🗺️ Kort
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
          <Text style={styles.loadingText}>Henter events...</Text>
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredFeed}
          renderItem={renderListItem}
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
      ) : (
        <View style={styles.mapContainer}>
          {mapItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📍</Text>
              {filteredFeed.length > 0 ? (
                <>
                  <Text style={styles.emptyText}>Mangler lokationer</Text>
                  <Text style={styles.emptySubtext}>
                    {mapItems.length} af {filteredFeed.length} events har koordinater
                  </Text>
                  <Text style={styles.emptyHint}>
                    Kør fixtures sync for at geocode stadions
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>Ingen events med lokation</Text>
                  <Text style={styles.emptySubtext}>Events uden adresse vises ikke på kortet</Text>
                </>
              )}
            </View>
          ) : (
            <>
              <MapView ref={mapRef} style={styles.map} initialRegion={FARUM_REGION}>
                {mapItems.map((item) => (
                  <Marker
                    key={`${item.kind}-${item.id}`}
                    coordinate={{ latitude: item.lat, longitude: item.lng }}
                    onPress={() => handleMarkerPress(item)}
                    tracksViewChanges={false}
                  >
                    <MapMarkerIcon logoUrl={item.logoUrl} type={item.kind} />
                  </Marker>
                ))}
              </MapView>

              {/* Bottom Sheet for selected marker */}
              {selectedItem && (
                <BottomSheet
                  ref={bottomSheetRef}
                  index={1}
                  snapPoints={snapPoints}
                  onChange={handleSheetChange}
                  enablePanDownToClose
                  bottomInset={tabBarHeight}
                  style={styles.bottomSheetContainer}
                >
                  <BottomSheetView style={styles.bottomSheetContent}>
                    <Text style={styles.bottomSheetTitle}>{selectedItem.title}</Text>
                    <Text style={styles.bottomSheetSubtitle}>
                      {new Date(selectedItem.datetime).toLocaleDateString('da-DK', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {selectedItem.subtitle && (
                      <Text style={styles.bottomSheetLocation}>📍 {selectedItem.subtitle}</Text>
                    )}

                    <TouchableOpacity
                      style={styles.bottomSheetButton}
                      onPress={handleBottomSheetCTA}
                    >
                      <Text style={styles.bottomSheetButtonText}>
                        {selectedItem.kind === 'match' ? 'Se kampdetaljer' : 'Se event'}
                      </Text>
                    </TouchableOpacity>
                  </BottomSheetView>
                </BottomSheet>
              )}
            </>
          )}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: colors.fcnRed,
    borderColor: colors.fcnRed,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: '#fff',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.subtext,
  },
  toggleTextActive: {
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.subtext,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
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
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.subtext,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  bottomSheetContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomSheetContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  bottomSheetLocation: {
    fontSize: 14,
    color: colors.subtext,
    marginBottom: spacing.md,
  },
  bottomSheetButton: {
    backgroundColor: colors.fcnRed,
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  bottomSheetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
