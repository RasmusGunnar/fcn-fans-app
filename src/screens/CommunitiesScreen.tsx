// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { AppHeader } from '../components/AppHeader';
import { Badge, Card, IconButton, SegmentedControl, Text } from '../components/ui';
import { Community as CommunityData, getCommunities } from '../services/communities';
import { getMyCommunityRoles } from '../services/rbac';
import { useTheme } from '../theme';

export default function CommunitiesScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const theme = useTheme();
  const styles = createStyles(theme);

  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [activeSegment, setActiveSegment] = useState<
    'all' | 'fan_factions' | 'communities' | 'mine'
  >('all');
  const [myCommunityRoles, setMyCommunityRoles] = useState<
    Record<string, 'owner' | 'admin' | 'member'>
  >({});

  useEffect(() => {
    loadCommunities();
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

  const loadCommunities = async () => {
    setLoading(true);
    const data = await getCommunities();
    setCommunities(data);
    setLoading(false);
  };

  const navigateToDetail = (id: string, title: string) => {
    (navigation as any).navigate('CommunityDetail', { id, title });
  };

  const segments = [
    { key: 'all', label: 'Alle' },
    { key: 'fan_factions', label: 'Fanfraktioner' },
    { key: 'communities', label: 'Fællesskaber' },
    { key: 'mine', label: 'Mine' },
  ] as const;

  const filteredCommunities = useMemo(() => {
    const baseList = (() => {
      if (activeSegment === 'mine') {
        return communities.filter((community) => !!myCommunityRoles[community.id]);
      }
      if (activeSegment === 'fan_factions') {
        return communities.filter((community) => community.type === 'fan_faction');
      }
      if (activeSegment === 'communities') {
        return communities.filter((community) => community.type === 'community');
      }
      return communities;
    })();

    const wildTigersName = 'wild tigers';
    const typeRank = (community: CommunityData) => (community.type === 'fan_faction' ? 0 : 1);
    const isWildTigers = (community: CommunityData) =>
      community.name?.trim().toLowerCase() === wildTigersName;

    const sorted = [...baseList].sort((a, b) => {
      const typeDiff = typeRank(a) - typeRank(b);
      if (typeDiff !== 0) return typeDiff;

      const aIsWild = isWildTigers(a) ? 0 : 1;
      const bIsWild = isWildTigers(b) ? 0 : 1;
      if (aIsWild !== bIsWild) return aIsWild - bIsWild;

      const aName = a.name?.toLowerCase() ?? '';
      const bName = b.name?.toLowerCase() ?? '';
      return aName.localeCompare(bName, 'da');
    });

    return sorted;
  }, [activeSegment, communities, myCommunityRoles]);

  const hasCoords = useMemo(
    () =>
      communities.some((community) => {
        const lat = (community as any).lat;
        const lng = (community as any).lng;
        return typeof lat === 'number' && typeof lng === 'number';
      }),
    [communities],
  );

  const mapCommunities = useMemo(
    () =>
      communities.filter((community) => {
        const lat = (community as any).lat;
        const lng = (community as any).lng;
        return typeof lat === 'number' && typeof lng === 'number';
      }),
    [communities],
  );

  const mapRegion = useMemo<Region | null>(() => {
    if (mapCommunities.length === 0) return null;
    const first = mapCommunities[0] as any;
    return {
      latitude: first.lat,
      longitude: first.lng,
      latitudeDelta: 0.4,
      longitudeDelta: 0.4,
    };
  }, [mapCommunities]);

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
            <MapView style={styles.map} initialRegion={mapRegion}>
              {mapCommunities.map((community) => {
                const lat = (community as any).lat as number;
                const lng = (community as any).lng as number;
                return (
                  <Marker
                    key={community.id}
                    coordinate={{ latitude: lat, longitude: lng }}
                    title={community.name}
                  />
                );
              })}
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
              {hasCoords
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
