import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MapView, { Marker, Region } from 'react-native-maps';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { EventsOverviewMatchCard } from '../components/events/EventsOverviewMatchCard';
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { MapMarkerIcon } from '../components/MapMarkerIcon';
import { IconButton } from '../components/ui/IconButton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import { fetchFeedUpcoming, type FeedItem } from '../services/eventsApi';
import { useFeed } from '../state/FeedContext';
import { defaultTheme as theme } from '../theme';
import type { FeedItem as HomeFeedItem } from '../types/feed';
import {
  logPerformanceEvent,
  logPerformanceTiming,
  measurePerformanceWork,
  performanceNow,
  schedulePerformanceFrame,
} from '../utils/performanceTiming';
import { targetKey } from '../utils/targetKey';

logPerformanceEvent('ScreenLifecycle', 'module-evaluated', { screen: 'EventsScreen' });

type ViewMode = 'list' | 'map';
type EventFilterKey = 'all' | 'matches' | 'events';

// Normalized map item type (for Kort view)
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
  feedItem: FeedItem;
};

const FARUM_REGION: Region = {
  latitude: 55.8,
  longitude: 12.36,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};
let hasEnteredEventsScreen = false;

export default function EventsScreen() {
  if (!hasEnteredEventsScreen) {
    hasEnteredEventsScreen = true;
    logPerformanceEvent('ScreenLifecycle', 'component-first-entered', {
      screen: 'EventsScreen',
    });
  }

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
    attendanceMap,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
  } = useFeed();

  // Rate-limit fixture sync: at most once per 30 min (in-memory)
  const lastSyncRef = useRef<number>(0);

  // Upstream feed still includes legacy top-level bus trips, but the Events
  // overview filters them out before rendering list/map content.
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEventType, setSelectedEventType] = useState<EventFilterKey>('all');
  const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);
  const didLogFirstCommitRef = useRef(false);

  const eventFilterSegments = [
    { key: 'all', label: 'Alle' },
    { key: 'matches', label: 'Kampe' },
    { key: 'events', label: 'Events' },
  ] as const satisfies readonly { key: EventFilterKey; label: string }[];

  const snapPoints = useMemo(() => ['20%', '45%', '85%'], []);

  const loadFeed = useCallback(async () => {
    const startedAt = performanceNow();
    // fetchFeedUpcoming already fetches matches + bus_trips + events and
    // returns them sorted chronologically by start time.
    try {
      const feedItems = await fetchFeedUpcoming();
      setFeed(feedItems);
      setLoading(false);
      schedulePerformanceFrame(() => {
        logPerformanceEvent('ScreenLifecycle', 'data-ready', {
          screen: 'EventsScreen',
          itemCount: feedItems.length,
        });
      });
    } finally {
      logPerformanceTiming('EventsWork', 'load-feed', startedAt);
    }
  }, []);

  useEffect(() => {
    return schedulePerformanceFrame(() => {
      if (didLogFirstCommitRef.current) return;
      didLogFirstCommitRef.current = true;
      logPerformanceEvent('ScreenLifecycle', 'first-render-committed', {
        screen: 'EventsScreen',
      });
      logPerformanceEvent('ScreenLifecycle', 'first-visible-shell-rendered', {
        screen: 'EventsScreen',
        shell: 'screen-root',
      });
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  };

  // Load visible content first. Optional admin sync runs afterward and refreshes
  // the list again only if it completes successfully.
  useFocusEffect(
    React.useCallback(() => {
      const focusStartedAt = performanceNow();
      logPerformanceEvent('ScreenLifecycle', 'focus-effect-started', {
        screen: 'EventsScreen',
      });
      const cancelFrame = schedulePerformanceFrame(() => {
        logPerformanceEvent('ScreenLifecycle', 'focus-visible-shell-rendered', {
          screen: 'EventsScreen',
          shell: 'screen-root',
        });
      });
      const loadThenSync = async () => {
        await loadFeed();

        const now = Date.now();
        const THIRTY_MIN = 30 * 60 * 1000;
        if (user && isAppAdmin && now - lastSyncRef.current > THIRTY_MIN) {
          lastSyncRef.current = now;
          console.log('[EventsScreen] focus → invoking sync-fixtures');
          try {
            const { data, error } = await supabase.functions.invoke('sync-fixtures');
            if (error) console.warn('[EventsScreen] sync-fixtures error:', error);
            else {
              if (__DEV__) console.log('[EventsScreen] sync-fixtures result:', data);
              await loadFeed();
            }
          } catch (e) {
            console.warn('[EventsScreen] sync-fixtures call failed:', e);
          }
        } else {
          console.log('[EventsScreen] focus → sync skipped (not admin or rate-limited)');
        }
      };
      void loadThenSync().finally(() => {
        logPerformanceTiming('ScreenLifecycle', 'focus-effect-finished', focusStartedAt, {
          screen: 'EventsScreen',
        });
      });

      return cancelFrame;
    }, [isAppAdmin, loadFeed, user]),
  );

  // ── Map items (only entries with lat/lng) ──────────────────────────────────

  function resolveImageUrl(
    raw: string | null | undefined,
    kind: 'profile' | 'community',
  ): string | null {
    if (!raw || !raw.trim()) return null;
    if (raw.startsWith('http')) return raw;
    // Storage path → full public URL
    const bucket = kind === 'profile' ? 'avatars' : 'community-logos';
    return getPublicUrl(bucket, raw);
  }

  function toCoordinateNumber(value: number | string | null | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function toDateTimestamp(value: string): number {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function getEventOrganizerLogo(item: Extract<FeedItem, { kind: 'event' }>): string | null {
    const pm = profileMap || {};
    const groupId = item.organizer_group_id ?? null;
    const userId = item.organizer_id ?? item.creator_user_id ?? item.created_by ?? null;

    // Community logo: not available in communityMap (name-only), skip
    // Profile avatar: resolve from profileMap
    if (userId && pm[userId]) {
      const url = resolveImageUrl(pm[userId].avatar_url, 'profile');
      if (url) return url;
    }
    return null;
  }

  const overviewFeed = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'EventsScreen-filter-overview-feed',
        () => feed.filter((item) => item.kind !== 'bus_trip'),
        { itemCount: feed.length },
      ),
    [feed],
  );

  const filteredFeed = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'EventsScreen-filter-selected-feed',
        () => {
          if (selectedEventType === 'all') {
            return overviewFeed;
          }

          const kindMap: Record<Exclude<EventFilterKey, 'all'>, 'match' | 'event'> = {
            matches: 'match',
            events: 'event',
          };

          return overviewFeed.filter((item) => item.kind === kindMap[selectedEventType]);
        },
        { itemCount: overviewFeed.length, filter: selectedEventType },
      ),
    [overviewFeed, selectedEventType],
  );

  const mapItems: MapItem[] = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'EventsScreen-build-map-items',
        () =>
          filteredFeed
            .map((item): MapItem | null => {
              if (item.kind === 'match') {
                const lat = toCoordinateNumber(item.lat);
                const lng = toCoordinateNumber(item.lng);
                if (lat == null || lng == null) return null;
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
                const lat = toCoordinateNumber(item.lat);
                const lng = toCoordinateNumber(item.lng);
                if (lat == null || lng == null) return null;
                return {
                  id: item.id,
                  kind: 'event',
                  title: item.title,
                  datetime: item.startAt,
                  lat,
                  lng,
                  subtitle: item.location || undefined,
                  logoUrl: getEventOrganizerLogo(item),
                  feedItem: item,
                };
              }
              return null;
            })
            .filter((item): item is MapItem => item !== null),
        { itemCount: filteredFeed.length },
      ),
    [filteredFeed, profileMap, communityMap],
  );

  const mapRenderItems = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'EventsScreen-sort-map-items',
        () => {
          if (selectedEventType !== 'matches') {
            return mapItems;
          }

          return [...mapItems].sort((a, b) => {
            const timeDiff = toDateTimestamp(b.datetime) - toDateTimestamp(a.datetime);
            if (timeDiff !== 0) return timeDiff;
            return `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`);
          });
        },
        { itemCount: mapItems.length, filter: selectedEventType },
      ),
    [mapItems, selectedEventType],
  );

  // ── Filter feed by event type ──────────────────────────────────────────────

  // ── FeedItem (eventsApi) → HomeFeedItem (types/feed) mapper ────────────────

  const toHomeFeedItem = useCallback((item: FeedItem): HomeFeedItem => {
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
          homeTeamProviderId: item.homeTeamProviderId ?? null,
          heroUrl: item.heroUrl ?? null,
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

    // event — include coverBucket/coverPath so EventCard can show the hero image
    return {
      kind: 'event',
      id: item.id,
      data: {
        id: item.id,
        title: item.title ?? null,
        description: item.description ?? null,

        // vigtig: brug samme navn som eventCardVM forventer
        startAt: item.startAt ?? null,

        location: item.location ?? null,

        organizerName: item.organizerName ?? null,
        organizerGroupId: item.organizer_group_id ?? null,
        organizerType: item.organizer_type ?? null,
        organizerId: item.organizer_id ?? null,
        creatorUserId: item.creator_user_id ?? null,
        createdBy: item.created_by ?? null,

        coverBucket: item.cover_bucket ?? null,
        coverPath: item.cover_path ?? null,
      },
    };
  }, []);

  // ── Render a single feed item (match, event, or bus_trip) ──────────────────

  const renderFeedItem = (item: FeedItem) => {
    if (item.kind === 'match') {
      return (
        <EventsOverviewMatchCard
          title={`${item.home} vs ${item.away}`}
          homeTeam={item.home}
          awayTeam={item.away}
          homeLogo={item.homeLogo}
          awayLogo={item.awayLogo}
          heroImageUrl={item.heroUrl ?? null}
          kickoffAt={item.kickoffAt}
          venue={item.venue}
          venueCity={item.venueCity}
          competition={item.competition}
          round={item.round}
          onPress={() => (navigation as any).navigate('MatchDetails', { fixtureId: item.id })}
        />
      );
    }

    const homeFeedItem = toHomeFeedItem(item);
    const targetKind =
      homeFeedItem.kind === 'match'
        ? 'match'
        : homeFeedItem.kind === 'bus_trip'
          ? 'bus_trip'
          : 'event';
    const key = targetKey(targetKind, homeFeedItem.id);
    const likeState = likeMap[key] || { liked: false, likes: 0 };
    const commentCount = commentCountMap[key] || 0;
    const commentPreviews = commentPreviewMap[key] || [];

    // @ts-ignore - attendanceMap is defined in FeedItemRendererProps
    return (
      <FeedItemRenderer
        item={homeFeedItem}
        itemKey={key}
        user={user}
        isAppAdmin={isAppAdmin}
        likeState={likeState}
        commentCount={commentCount}
        commentPreviews={commentPreviews}
        safeProfileMap={profileMap || {}}
        communityMap={communityMap || {}}
        // @ts-ignore
        attendanceMap={attendanceMap}
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

  // ── Map callbacks ──────────────────────────────────────────────────────────

  const handleMarkerPress = useCallback((item: MapItem) => {
    setSelectedItem(item);
    bottomSheetRef.current?.snapToIndex(1); // Open to 45%
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
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

  useEffect(() => {
    setSelectedItem(null);
  }, [selectedEventType, viewMode]);

  useEffect(() => {
    if (!selectedItem) return;

    const stillVisible = mapItems.some(
      (item) => item.kind === selectedItem.kind && item.id === selectedItem.id,
    );

    if (!stillVisible) {
      setSelectedItem(null);
    }
  }, [mapItems, selectedItem]);

  // Fit map to markers when entering map view
  useEffect(() => {
    if (viewMode === 'map' && mapItems.length > 0 && mapRef.current) {
      const coordinates = mapItems.map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
      }));

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 300, left: 50 },
          animated: true,
        });
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, mapItems.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={styles.container}>
      <AppHeader
        title="Events & Kampe"
        subtitle="Kommende begivenheder"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      {/* Event Filter Segmented + View Mode Toggle */}
      <View style={styles.controlsBar}>
        <SegmentedControl
          items={eventFilterSegments}
          activeKey={selectedEventType}
          onChange={setSelectedEventType}
          style={styles.segmentedControlContainer}
        />

        <View style={styles.viewToggleContainer}>
          <IconButton
            icon={viewMode === 'list' ? 'list' : 'list-outline'}
            size="sm"
            variant="filled"
            color={viewMode === 'list' ? theme.colors.text.primary : theme.colors.text.secondary}
            onPress={() => setViewMode('list')}
          />

          <IconButton
            icon={viewMode === 'map' ? 'map' : 'map-outline'}
            size="sm"
            variant="filled"
            color={viewMode === 'map' ? theme.colors.text.primary : theme.colors.text.secondary}
            onPress={() => setViewMode('map')}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Henter events...</Text>
        </View>
      ) : viewMode === 'list' ? (
        /* Unified chronological overview list: matches + events only.
           by start time. ScrollView + .map() — dataset is small enough (<60 items). */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: tabBarHeight + theme.spacing[6] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {filteredFeed.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>Ingen kommende begivenheder</Text>
              <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
            </View>
          ) : (
            filteredFeed.map((item) => (
              <View key={`${item.kind}-${item.id}`}>{renderFeedItem(item)}</View>
            ))
          )}
        </ScrollView>
      ) : (
        <View style={styles.mapContainer}>
          {mapItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📍</Text>
              {filteredFeed.length > 0 ? (
                <>
                  <Text style={styles.emptyText}>Mangler lokationer</Text>
                  <Text style={styles.emptySubtext}>
                    {mapItems.length} af {filteredFeed.length} begivenheder har koordinater
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
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={FARUM_REGION}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                {mapRenderItems.map((item, index) => (
                  <Marker
                    key={`${item.kind}-${item.id}`}
                    coordinate={{ latitude: item.lat, longitude: item.lng }}
                    onPress={() => handleMarkerPress(item)}
                    anchor={{ x: 0.5, y: 1 }}
                    centerOffset={{ x: 0, y: -16 }}
                    zIndex={index + 1}
                    flat={false}
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
  scrollView: {
    flex: 1,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[2],
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing[2],
    marginVertical: theme.spacing[2],
    gap: theme.spacing[2],
    alignItems: 'center',
  },
  segmentedControlContainer: {
    flex: 1,
  },
  viewToggleContainer: {
    flexDirection: 'row',
    gap: theme.spacing[1],
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
