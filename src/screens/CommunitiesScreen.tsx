// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { AppHeader } from '../components/AppHeader';
import { MapMarkerIcon } from '../components/MapMarkerIcon';
import { Badge, Card, IconButton, SegmentedControl, Text } from '../components/ui';
import { getPublicUrl } from '../lib/storageUrl';
import {
  Community as CommunityData,
  getCommunities,
  sortCommunities,
} from '../services/communities';
import { getMyCommunityRoles } from '../services/rbac';
import { useTheme } from '../theme';
import {
  logPerformanceEvent,
  logPerformanceTiming,
  measurePerformanceWork,
  performanceNow,
  schedulePerformanceFrame,
} from '../utils/performanceTiming';

logPerformanceEvent('ScreenLifecycle', 'module-evaluated', {
  screen: 'CommunitiesScreen',
});

type CoordinateSource =
  | 'lat'
  | 'lng'
  | 'latitude'
  | 'longitude'
  | 'coordinates.lat'
  | 'coordinates.lng'
  | 'coordinates.latitude'
  | 'coordinates.longitude';

type NormalizedCommunityCoordinate = {
  latitude: number;
  longitude: number;
  latitudeSource: CoordinateSource;
  longitudeSource: CoordinateSource;
};

type CommunityMapAudit = {
  community: CommunityData;
  normalizedCoordinate: NormalizedCommunityCoordinate | null;
  exclusionReason: string | null;
  debug: {
    lat: unknown;
    lng: unknown;
    latitude: unknown;
    longitude: unknown;
    coordinates: unknown;
    location_label: string | null;
    place_name: string | null;
    geocoded_at: string | null;
    type: CommunityData['type'];
  };
};

type MapCommunityItem = {
  community: CommunityData;
  coordinate: NormalizedCommunityCoordinate;
};

type RenderedMapCommunityItem = {
  community: CommunityData;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  baseCoordinate: NormalizedCommunityCoordinate;
  overlapIndex: number;
  overlapGroupSize: number;
};

const COMMUNITY_MAP_DEBUG_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_COMMUNITY_MAP_DEBUG?.trim().toLowerCase() === 'true';
let hasEnteredCommunitiesScreen = false;

type CommunityCoordinateRecord = CommunityData & {
  latitude?: unknown;
  longitude?: unknown;
  coordinates?: {
    lat?: unknown;
    lng?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  } | null;
};

function parseCoordinateValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCommunityCoordinate(community: CommunityData): CommunityMapAudit {
  const coordinateRecord = community as CommunityCoordinateRecord;
  const latitudeCandidates: { source: CoordinateSource; value: unknown }[] = [
    { source: 'lat', value: coordinateRecord.lat },
    { source: 'latitude', value: coordinateRecord.latitude },
    { source: 'coordinates.lat', value: coordinateRecord.coordinates?.lat },
    { source: 'coordinates.latitude', value: coordinateRecord.coordinates?.latitude },
  ];
  const longitudeCandidates: { source: CoordinateSource; value: unknown }[] = [
    { source: 'lng', value: coordinateRecord.lng },
    { source: 'longitude', value: coordinateRecord.longitude },
    { source: 'coordinates.lng', value: coordinateRecord.coordinates?.lng },
    { source: 'coordinates.longitude', value: coordinateRecord.coordinates?.longitude },
  ];

  const latitudeMatch = latitudeCandidates
    .map((candidate) => ({
      ...candidate,
      parsed: parseCoordinateValue(candidate.value),
    }))
    .find((candidate) => candidate.parsed !== null);
  const longitudeMatch = longitudeCandidates
    .map((candidate) => ({
      ...candidate,
      parsed: parseCoordinateValue(candidate.value),
    }))
    .find((candidate) => candidate.parsed !== null);

  const debug = {
    lat: coordinateRecord.lat,
    lng: coordinateRecord.lng,
    latitude: coordinateRecord.latitude,
    longitude: coordinateRecord.longitude,
    coordinates: coordinateRecord.coordinates ?? null,
    location_label: community.location_label,
    place_name: community.place_name,
    geocoded_at: community.geocoded_at,
    type: community.type,
  };

  if (!latitudeMatch && !longitudeMatch) {
    return {
      community,
      normalizedCoordinate: null,
      exclusionReason: 'missing_lat_and_lng',
      debug,
    };
  }

  if (!latitudeMatch) {
    return {
      community,
      normalizedCoordinate: null,
      exclusionReason: 'missing_or_invalid_lat',
      debug,
    };
  }

  if (!longitudeMatch) {
    return {
      community,
      normalizedCoordinate: null,
      exclusionReason: 'missing_or_invalid_lng',
      debug,
    };
  }

  if (latitudeMatch.parsed < -90 || latitudeMatch.parsed > 90) {
    return {
      community,
      normalizedCoordinate: null,
      exclusionReason: 'lat_out_of_range',
      debug,
    };
  }

  if (longitudeMatch.parsed < -180 || longitudeMatch.parsed > 180) {
    return {
      community,
      normalizedCoordinate: null,
      exclusionReason: 'lng_out_of_range',
      debug,
    };
  }

  return {
    community,
    normalizedCoordinate: {
      latitude: latitudeMatch.parsed,
      longitude: longitudeMatch.parsed,
      latitudeSource: latitudeMatch.source,
      longitudeSource: longitudeMatch.source,
    },
    exclusionReason: null,
    debug,
  };
}

function spreadOverlappingCommunityMarkers(
  mapItems: MapCommunityItem[],
): RenderedMapCommunityItem[] {
  const overlapGroups = new Map<string, MapCommunityItem[]>();

  mapItems.forEach((item) => {
    const groupKey = `${item.coordinate.latitude.toFixed(6)}:${item.coordinate.longitude.toFixed(6)}`;
    const existing = overlapGroups.get(groupKey) ?? [];
    existing.push(item);
    overlapGroups.set(groupKey, existing);
  });

  return Array.from(overlapGroups.values()).flatMap((group) => {
    if (group.length === 1) {
      const [item] = group;
      return [
        {
          community: item.community,
          coordinate: {
            latitude: item.coordinate.latitude,
            longitude: item.coordinate.longitude,
          },
          baseCoordinate: item.coordinate,
          overlapIndex: 0,
          overlapGroupSize: 1,
        },
      ];
    }

    return group.map((item, index) => {
      const angle = (2 * Math.PI * index) / group.length;
      const radius = 0.00022;

      return {
        community: item.community,
        coordinate: {
          latitude: item.coordinate.latitude + Math.cos(angle) * radius,
          longitude: item.coordinate.longitude + Math.sin(angle) * radius,
        },
        baseCoordinate: item.coordinate,
        overlapIndex: index,
        overlapGroupSize: group.length,
      };
    });
  });
}

export default function CommunitiesScreen() {
  if (!hasEnteredCommunitiesScreen) {
    hasEnteredCommunitiesScreen = true;
    logPerformanceEvent('ScreenLifecycle', 'component-first-entered', {
      screen: 'CommunitiesScreen',
    });
  }

  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const theme = useTheme();
  const styles = createStyles(theme);
  const mapRef = useRef<MapView>(null);

  const [baseCommunities, setBaseCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [activeSegment, setActiveSegment] = useState<
    'all' | 'fan_factions' | 'communities' | 'mine'
  >('all');
  const [myCommunityRoles, setMyCommunityRoles] = useState<
    Record<string, 'owner' | 'admin' | 'member'>
  >({});
  const hasLoadedCommunitiesRef = useRef(false);
  const isLoadingCommunitiesRef = useRef(false);
  const didLogFirstCommitRef = useRef(false);

  useEffect(() => {
    return schedulePerformanceFrame(() => {
      if (didLogFirstCommitRef.current) return;
      didLogFirstCommitRef.current = true;
      logPerformanceEvent('ScreenLifecycle', 'first-render-committed', {
        screen: 'CommunitiesScreen',
      });
      logPerformanceEvent('ScreenLifecycle', 'first-visible-shell-rendered', {
        screen: 'CommunitiesScreen',
        shell: 'screen-root',
      });
    });
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadRoles = async () => {
      const roles = await getMyCommunityRoles();
      if (isActive) {
        setMyCommunityRoles(roles);
      }
    };
    loadRoles();
    return () => {
      isActive = false;
    };
  }, []);

  const loadCommunities = useCallback(async () => {
    if (isLoadingCommunitiesRef.current) {
      logPerformanceEvent('CommunitiesWork', 'load-communities-skipped', {
        reason: 'request-in-flight',
      });
      return;
    }

    const startedAt = performanceNow();
    let loadedCount = 0;
    let dataReady = false;
    isLoadingCommunitiesRef.current = true;
    if (!hasLoadedCommunitiesRef.current) {
      setLoading(true);
    }

    try {
      const data = await getCommunities();
      loadedCount = data.length;
      dataReady = true;
      setBaseCommunities(data);
    } finally {
      isLoadingCommunitiesRef.current = false;
      hasLoadedCommunitiesRef.current = true;
      setLoading(false);
      logPerformanceTiming('CommunitiesWork', 'load-communities', startedAt, {
        itemCount: loadedCount,
      });
      if (dataReady) {
        schedulePerformanceFrame(() => {
          logPerformanceEvent('ScreenLifecycle', 'data-ready', {
            screen: 'CommunitiesScreen',
            itemCount: loadedCount,
          });
        });
      }
    }
  }, []);

  // Refetch communities when screen is focused (e.g., after admin approval of fan faction requests)
  useFocusEffect(
    useCallback(() => {
      const focusStartedAt = performanceNow();
      logPerformanceEvent('ScreenLifecycle', 'focus-effect-started', {
        screen: 'CommunitiesScreen',
      });
      const cancelFrame = schedulePerformanceFrame(() => {
        logPerformanceEvent('ScreenLifecycle', 'focus-visible-shell-rendered', {
          screen: 'CommunitiesScreen',
          shell: hasLoadedCommunitiesRef.current ? 'content' : 'loading',
        });
      });
      void loadCommunities().finally(() => {
        logPerformanceTiming('ScreenLifecycle', 'focus-effect-finished', focusStartedAt, {
          screen: 'CommunitiesScreen',
        });
      });

      return cancelFrame;
    }, [loadCommunities]),
  );

  const navigateToDetail = (id: string, title: string) => {
    (navigation as any).navigate('CommunityDetail', { id, title });
  };

  const segments = [
    { key: 'all', label: 'Alle' },
    { key: 'fan_factions', label: 'Fanfraktioner' },
    { key: 'communities', label: 'Fællesskaber' },
    { key: 'mine', label: 'Mine' },
  ] as const;

  const orderedBaseCommunities = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'CommunitiesScreen-sort',
        () => sortCommunities(baseCommunities),
        { itemCount: baseCommunities.length },
      ),
    [baseCommunities],
  );

  const communitiesByTab = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'CommunitiesScreen-build-segment-lists',
        () => ({
          all: orderedBaseCommunities,
          fan_factions: orderedBaseCommunities.filter(
            (community) => community.type === 'fan_faction',
          ),
          communities: orderedBaseCommunities.filter(
            (community) => community.type === 'community',
          ),
          mine: orderedBaseCommunities.filter((community) => !!myCommunityRoles[community.id]),
        }),
        { itemCount: orderedBaseCommunities.length },
      ),
    [myCommunityRoles, orderedBaseCommunities],
  );

  const filteredCommunities = useMemo(
    () => communitiesByTab[activeSegment],
    [activeSegment, communitiesByTab],
  );

  const normalizedFilteredCommunities = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'CommunitiesScreen-normalize-coordinates',
        () => filteredCommunities.map((community) => normalizeCommunityCoordinate(community)),
        { itemCount: filteredCommunities.length },
      ),
    [filteredCommunities],
  );

  const mapCommunities = useMemo(
    () =>
      normalizedFilteredCommunities.flatMap((item) =>
        item.normalizedCoordinate
          ? [{ community: item.community, coordinate: item.normalizedCoordinate }]
          : [],
      ),
    [normalizedFilteredCommunities],
  );

  const mapExcludedCommunities = useMemo(
    () => normalizedFilteredCommunities.filter((item) => !item.normalizedCoordinate),
    [normalizedFilteredCommunities],
  );

  const filteredCommunitiesDebug = useMemo(() => {
    if (!COMMUNITY_MAP_DEBUG_ENABLED) return [];
    return normalizedFilteredCommunities.map((item) => ({
      id: item.community.id,
      name: item.community.name,
      type: item.community.type,
      lat: item.debug.lat,
      lng: item.debug.lng,
      latitude: item.debug.latitude,
      longitude: item.debug.longitude,
      coordinates: item.debug.coordinates,
      location_label: item.debug.location_label,
      place_name: item.debug.place_name,
      geocoded_at: item.debug.geocoded_at,
      normalizedLatitude: item.normalizedCoordinate?.latitude ?? null,
      normalizedLongitude: item.normalizedCoordinate?.longitude ?? null,
      latitudeSource: item.normalizedCoordinate?.latitudeSource ?? null,
      longitudeSource: item.normalizedCoordinate?.longitudeSource ?? null,
      exclusionReason: item.exclusionReason,
    }));
  }, [normalizedFilteredCommunities]);

  const mapCommunitiesDebug = useMemo(() => {
    if (!COMMUNITY_MAP_DEBUG_ENABLED) return [];
    return mapCommunities.map((item) => ({
      id: item.community.id,
      name: item.community.name,
      type: item.community.type,
      latitude: item.coordinate.latitude,
      longitude: item.coordinate.longitude,
      latitudeSource: item.coordinate.latitudeSource,
      longitudeSource: item.coordinate.longitudeSource,
    }));
  }, [mapCommunities]);

  const mapExcludedCommunitiesDebug = useMemo(() => {
    if (!COMMUNITY_MAP_DEBUG_ENABLED) return [];
    return mapExcludedCommunities.map((item) => ({
      id: item.community.id,
      name: item.community.name,
      type: item.community.type,
      reason: item.exclusionReason,
      lat: item.debug.lat,
      lng: item.debug.lng,
      latitude: item.debug.latitude,
      longitude: item.debug.longitude,
      coordinates: item.debug.coordinates,
      location_label: item.debug.location_label,
      place_name: item.debug.place_name,
      geocoded_at: item.debug.geocoded_at,
    }));
  }, [mapExcludedCommunities]);

  const renderedMarkerCommunities = useMemo(
    () =>
      measurePerformanceWork(
        'RenderBlock',
        'CommunitiesScreen-spread-map-markers',
        () => spreadOverlappingCommunityMarkers(mapCommunities),
        { itemCount: mapCommunities.length },
      ),
    [mapCommunities],
  );

  const renderedMarkerDebug = useMemo(() => {
    if (!COMMUNITY_MAP_DEBUG_ENABLED) return [];
    return renderedMarkerCommunities.map((item) => ({
      id: item.community.id,
      name: item.community.name,
      type: item.community.type,
      latitude: item.coordinate.latitude,
      longitude: item.coordinate.longitude,
      baseLatitude: item.baseCoordinate.latitude,
      baseLongitude: item.baseCoordinate.longitude,
      overlapIndex: item.overlapIndex,
      overlapGroupSize: item.overlapGroupSize,
      latitudeSource: item.baseCoordinate.latitudeSource,
      longitudeSource: item.baseCoordinate.longitudeSource,
    }));
  }, [renderedMarkerCommunities]);

  const mapCommunitiesKey = useMemo(
    () => renderedMarkerCommunities.map((item) => item.community.id).join(','),
    [renderedMarkerCommunities],
  );

  const mapViewKey = useMemo(
    () => `${activeSegment}:${mapCommunitiesKey}`,
    [activeSegment, mapCommunitiesKey],
  );

  useEffect(() => {
    if (!COMMUNITY_MAP_DEBUG_ENABLED) {
      return;
    }

    console.log('[CommunitiesScreen] selectedTab:', activeSegment);
    console.log('[CommunitiesScreen] filteredCommunities:', {
      count: filteredCommunitiesDebug.length,
      communities: filteredCommunitiesDebug,
    });
    console.log('[CommunitiesScreen] mapCommunities:', {
      count: mapCommunitiesDebug.length,
      communities: mapCommunitiesDebug,
    });
    console.log('[CommunitiesScreen] renderedMarkers:', {
      count: renderedMarkerDebug.length,
      communities: renderedMarkerDebug,
    });
    console.log('[CommunitiesScreen] excludedFromMapMissingCoordinates:', {
      count: mapExcludedCommunitiesDebug.length,
      communities: mapExcludedCommunitiesDebug,
    });
  }, [
    activeSegment,
    filteredCommunitiesDebug,
    mapCommunitiesDebug,
    renderedMarkerDebug,
    mapExcludedCommunitiesDebug,
  ]);

  const hasCoordsInFilteredCommunities = useMemo(() => mapCommunities.length > 0, [mapCommunities]);

  const mapRegion = useMemo<Region | null>(() => {
    if (renderedMarkerCommunities.length === 0) return null;
    const first = renderedMarkerCommunities[0];
    return {
      latitude: first.coordinate.latitude,
      longitude: first.coordinate.longitude,
      latitudeDelta: 0.4,
      longitudeDelta: 0.4,
    };
  }, [renderedMarkerCommunities]);

  const getCommunityMarkerLogo = (community: CommunityData): string | null => {
    if (community.avatar_url) {
      return community.avatar_url;
    }
    if (community.avatar_path) {
      return getPublicUrl('avatars', community.avatar_path);
    }
    if (community.cover_path) {
      return getPublicUrl('community-media', community.cover_path);
    }
    return null;
  };

  const fitMapToRenderedMarkers = useCallback(() => {
    if (!mapRef.current || renderedMarkerCommunities.length === 0) {
      return;
    }

    const coordinates = renderedMarkerCommunities.map((item) => ({
      latitude: item.coordinate.latitude,
      longitude: item.coordinate.longitude,
    }));

    if (coordinates.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: coordinates[0].latitude,
          longitude: coordinates[0].longitude,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        },
        250,
      );
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 64, right: 64, bottom: 64, left: 64 },
      animated: true,
    });
  }, [renderedMarkerCommunities]);

  useEffect(() => {
    if (viewMode !== 'map' || renderedMarkerCommunities.length === 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      fitMapToRenderedMarkers();
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [viewMode, mapViewKey, fitMapToRenderedMarkers, renderedMarkerCommunities.length]);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <AppHeader
          title="Fællesskaber"
          subtitle="Find dit fanfællesskab"
          onPressProfile={() => (navigation as any).navigate('Profile')}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title="Fællesskaber"
        subtitle="Find dit fanfællesskab"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <View style={styles.controlsBar}>
        <SegmentedControl
          items={segments}
          activeKey={activeSegment}
          onChange={setActiveSegment}
          style={styles.segmentedControl}
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

      {viewMode === 'map' ? (
        mapCommunities.length > 0 && mapRegion ? (
          <View style={styles.mapContainer}>
            <MapView
              key={mapViewKey}
              ref={mapRef}
              style={styles.map}
              initialRegion={mapRegion}
              rotateEnabled={false}
              pitchEnabled={false}
              onMapReady={fitMapToRenderedMarkers}
            >
              {renderedMarkerCommunities.map((item) => (
                <Marker
                  key={item.community.id}
                  coordinate={{
                    latitude: item.coordinate.latitude,
                    longitude: item.coordinate.longitude,
                  }}
                  title={item.community.name}
                  onPress={() => navigateToDetail(item.community.id, item.community.name)}
                  anchor={{ x: 0.5, y: 1 }}
                  flat={false}
                  tracksViewChanges={false}
                >
                  <MapMarkerIcon
                    logoUrl={getCommunityMarkerLogo(item.community)}
                    type={item.community.type}
                    memberCount={item.community.member_count}
                  />
                </Marker>
              ))}
            </MapView>
          </View>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons
              name="map-outline"
              size={theme.components.icon.size.lg}
              color={theme.colors.text.muted}
            />
            <Text variant="bodyBold" style={styles.mapPlaceholderTitle}>
              Kortvisning kommer snart
            </Text>
            <Text variant="body" color="secondary" style={styles.mapPlaceholderText}>
              {hasCoordsInFilteredCommunities
                ? 'Kortvisning er midlertidigt slået fra'
                : 'Der er endnu ingen koordinater for fællesskaber'}
            </Text>
          </View>
        )
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + theme.spacing[6] },
          ]}
        >
          {filteredCommunities.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={theme.components.icon.size.lg}
                color={theme.colors.text.muted}
              />
              <Text variant="h3" style={styles.emptyTitle}>
                Ingen fællesskaber endnu
              </Text>
              <Text variant="body" color="secondary" style={styles.emptySubtitle}>
                Vær den første til at oprette et!
              </Text>
            </View>
          ) : (
            <View style={styles.cards}>
              {filteredCommunities.map((community) => {
                const isFaction = community.type === 'fan_faction';
                const badgeLabel = isFaction ? 'FANFRAKTION' : 'LOKALT';
                const ctaLabel = isFaction ? 'Gå til fraktion →' : 'Gå til fællesskab →';
                const accentColor = isFaction ? theme.colors.brand.accent : theme.colors.state.info;
                const badgeVariant = isFaction ? 'brandSoft' : 'infoSoft';

                return (
                  <Card key={community.id} variant="feedItem" style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.avatar}>
                        {community.avatar_url ? (
                          <Image
                            source={{ uri: community.avatar_url }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <Ionicons
                            name={isFaction ? 'star' : 'people'}
                            size={theme.components.icon.size.md}
                            color={accentColor}
                          />
                        )}
                      </View>

                      <View style={styles.cardContent}>
                        <View style={styles.titleRow}>
                          <Text variant="bodyBold">{community.name}</Text>
                          <View style={styles.badgeWrap}>
                            <Badge label={badgeLabel} variant={badgeVariant} size="sm" />
                          </View>
                        </View>
                        <Text
                          variant="small"
                          color="secondary"
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {community.description || 'Ingen beskrivelse'}
                        </Text>
                        {community.member_count !== undefined && (
                          <View style={styles.memberRow}>
                            <Ionicons
                              name="people"
                              size={theme.spacing[3]}
                              color={theme.colors.text.muted}
                              style={styles.memberIcon}
                            />
                            <Text variant="caption" color="muted">
                              {community.member_count} medlem
                              {community.member_count !== 1 ? 'mer' : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Pressable
                      onPress={() => navigateToDetail(community.id, community.name)}
                      style={({ pressed }) => [
                        styles.ctaButton,
                        { backgroundColor: accentColor },
                        pressed && styles.ctaButtonPressed,
                      ]}
                    >
                      <Text variant="small" style={styles.ctaText}>
                        {ctaLabel}
                      </Text>
                    </Pressable>
                  </Card>
                );
              })}
            </View>
          )}

          <Pressable
            style={styles.createCta}
            onPress={() => (navigation as any).navigate('CreateCommunity')}
          >
            <View style={styles.createCtaContent}>
              <Ionicons
                name="add-circle"
                size={theme.components.icon.size.lg}
                color={theme.colors.primary}
              />
              <Text variant="h3" style={styles.createCtaTitle}>
                Mangler dit område?
              </Text>
              <Text variant="body" color="secondary" style={styles.createCtaText}>
                Opret dit eget fællesskab og saml lokale fans
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    loadingScreen: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      gap: theme.spacing[2],
    },
    segmentedControl: {
      flex: 1,
    },
    viewToggleContainer: {
      flexDirection: 'row',
      gap: theme.spacing[1],
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[2],
    },
    cards: {
      gap: theme.spacing[2],
      marginBottom: theme.spacing[4],
    },
    card: {
      padding: theme.spacing[2],
      gap: theme.spacing[2],
      borderRadius: theme.radius.lg,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[2],
    },
    avatar: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    cardContent: {
      flex: 1,
      gap: theme.spacing[1],
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    memberIcon: {
      marginTop: theme.layout.borderHairline,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    badgeWrap: {
      alignSelf: 'flex-start',
    },
    ctaButton: {
      height: theme.spacing[9],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
    },
    ctaButtonPressed: {
      opacity: 0.85,
    },
    ctaText: {
      color: theme.colors.text.inverse,
      textAlign: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: theme.spacing[8],
      paddingHorizontal: theme.spacing[6],
      gap: theme.spacing[2],
    },
    emptyTitle: {
      textAlign: 'center',
    },
    emptySubtitle: {
      textAlign: 'center',
    },
    mapPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[6],
      gap: theme.spacing[2],
    },
    mapPlaceholderTitle: {
      textAlign: 'center',
    },
    mapPlaceholderText: {
      textAlign: 'center',
    },
    mapContainer: {
      flex: 1,
    },
    map: {
      width: '100%',
      height: '100%',
    },
    createCta: {
      backgroundColor: theme.colors.pill.yellow.bg,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.primary,
      borderStyle: 'dashed',
      borderRadius: theme.radius.md,
      padding: theme.spacing[6],
      alignItems: 'center',
    },
    createCtaContent: {
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    createCtaTitle: {
      textAlign: 'center',
    },
    createCtaText: {
      textAlign: 'center',
    },
  });
