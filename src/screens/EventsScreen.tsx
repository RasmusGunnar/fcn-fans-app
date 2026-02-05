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
import { MapMarkerIcon } from '../components/MapMarkerIcon';
import { fetchFeedUpcoming, type FeedItem } from '../services/eventsApi';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import type { FeedItem as HomeFeedItem } from '../types/feed';
import { targetKey } from '../utils/targetKey';
import { defaultTheme as theme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { useFeed } from '../state/FeedContext';

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

const isEventLike = (kind: string) => kind === 'event' || kind === 'bus_trip';
const toEventType = (kind: string) => (kind === 'bus_trip' ? 'bustur' : 'event');

export default function EventsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { user, isAppAdmin } = useAuth();
  const {
    profileMap,
    communityMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
  } = useFeed();

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
    if (filterMode === 'events') return isEventLike(item.kind);
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

  const toHomeFeedItem = (item: FeedItem): HomeFeedItem => {
    if (item.kind === 'match') {
      return {
        kind: 'match',
        id: item.id,
        data: {
          id: item.id,
          kickoffAt: item.kickoffAt,
          home: item.home,
          away: item.away,
          homeLogo: item.homeLogo,
          awayLogo: item.awayLogo,
          venue: item.venue,
          venueCity: item.venueCity,
          competition: item.competition,
          round: item.round,
        },
      };
    }

    if (item.kind === 'bus_trip') {
      return {
        kind: 'bus_trip',
        id: item.id,
        data: {
          id: item.id,
          title: item.title,
          startAt: item.startAt,
          location: item.departurePlace,
          description: item.description,
          organizerName: item.organizerName,
          organizerGroupId: null,
          createdAt: null,
          eventType: 'bus_trip',
        },
      };
    }

    return {
      kind: 'event',
      id: item.id,
      data: {
        id: item.id,
        title: item.title,
        startAt: item.startAt,
        location: item.location,
        description: item.description,
        organizerName: item.organizerName,
        organizerGroupId: item.organizer_group_id ?? null,
        organizerType: item.organizer_type ?? null,
        organizerId: item.organizer_id ?? null,
        creatorUserId: item.creator_user_id ?? null,
        createdBy: item.created_by ?? null,
        createdAt: null,
        eventType: 'event',
      },
    };
  };

  const renderListItem = ({ item }: { item: FeedItem }) => {
    const feedItem = toHomeFeedItem(item);
    const key = targetKey(feedItem.kind, feedItem.id);
    const likeState = likeMap[key] || { liked: false, likes: 0 };
    const commentCount = commentCountMap[key] || 0;
    const commentPreviews = commentPreviewMap[key] || [];

    return (
      <FeedItemRenderer
        item={feedItem}
        itemKey={key}
        user={user}
        isAppAdmin={isAppAdmin}
        likeState={likeState}
        commentCount={commentCount}
        commentPreviews={commentPreviews}
        safeProfileMap={profileMap || {}}
        communityMap={communityMap || {}}
        toggleLike={toggleLike}
        removePost={() => {}}
        removeNews={() => {}}
        incrementCommentCount={incrementCommentCount}
        addCommentPreview={addCommentPreview}
        onPressMatch={(matchId) =>
          (navigation as any).navigate('MatchDetails', { fixtureId: matchId })
        }
        onPressBusTrip={(busTripId) =>
          (navigation as any).navigate('BusTripDetails', { busTripId })
        }
        onPressEvent={(eventId) => (navigation as any).navigate('EventDetails', { eventId })}
      />
    );
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
          <Text style={[styles.chipText, filterMode === 'all' && styles.chipTextActive]}>Alle</Text>
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Henter events...</Text>
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredFeed}
          renderItem={renderListItem}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{
            paddingBottom: tabBarHeight + theme.spacing[6],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
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
                  <Text style={styles.emptyHint}>Kør fixtures sync for at geocode stadions</Text>
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
    backgroundColor: theme.colors.bg.default,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.bg.elevated,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  chipTextActive: {
    color: theme.colors.bg.elevated,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border.light,
    padding: theme.spacing[1],
  },
  toggleButton: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    alignItems: 'center',
    borderRadius: theme.radius.sm,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.bg.elevated,
    // Shadow removed per design system rules
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  toggleTextActive: {
    color: theme.colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: theme.spacing[8],
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[6],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing[4],
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: theme.spacing[1],
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
    // Shadow removed per design system rules
  },
  bottomSheetContent: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[8],
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[1],
  },
  bottomSheetLocation: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[4],
  },
  bottomSheetButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing[4],
  },
  bottomSheetButtonText: {
    color: theme.colors.bg.elevated,
    fontSize: 16,
    fontWeight: '600',
  },
});
