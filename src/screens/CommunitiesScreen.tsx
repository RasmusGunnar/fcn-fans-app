// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { Card, Text, Screen } from '../components/ui';
import { PrimaryButton } from '../components/PrimaryButton';
import { ListRow } from '../ui/components/ListRow';
import { useTheme } from '../theme';
import { getCommunities, Community as CommunityData } from '../services/communities';

export default function CommunitiesScreen() {
  console.log('🚀 DEBUG: CommunitiesScreen LOADED (feat/communities-rbac-avatars)');
  
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const theme = useTheme();
  const styles = createStyles(theme);
  
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommunities();
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

  const getButtonVariant = (type: string) => {
    return type === 'fan_faction' ? 'red' : 'blue';
  };

  const factions = communities.filter((c) => c.type === 'fan_faction');
  const localCommunities = communities.filter((c) => c.type === 'community');

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg.default }}>
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg.default }}
      contentContainerStyle={{ paddingBottom: tabBarHeight + theme.spacing[6] }}
    >
      <Text variant="small" color="muted" style={{ padding: theme.spacing[2] }}>DEBUG: Communities v2</Text>
      <AppHeader
        title="Fællesskaber"
        subtitle="Find dit fanfællesskab"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <View style={{ padding: theme.spacing[4] }}>
        {/* Fan Fraktioner Section */}
        {factions.length > 0 && (
          <View style={{ marginBottom: theme.spacing[8] }}>
            <Text variant="caption" style={[styles.sectionTitle, { marginBottom: theme.spacing[3] }]}>FAN FRAKTIONER</Text>
            {factions.map((faction) => (
              <Card key={faction.id} style={{ marginBottom: theme.spacing[3] }}>
                <View style={[styles.cardHeader, { marginBottom: theme.spacing[3] }]}>
                  <View style={[styles.avatar, { marginRight: theme.spacing[4], width: 60, height: 60, borderRadius: theme.radius.pill }]}>
                    {faction.avatar_url ? (
                      <Image source={{ uri: faction.avatar_url }} style={[styles.avatarImage, { width: 60, height: 60 }]} />
                    ) : (
                      <Ionicons name="star" size={40} color={theme.colors.primary} />
                    )}
                  </View>
                  <View style={styles.cardContent}>
                    <Text variant="h3">{faction.name}</Text>
                    <Text variant="body" color="secondary">
                      {faction.description || 'Ingen beskrivelse'}
                    </Text>
                    {faction.member_count !== undefined && (
                      <Text variant="small" color="muted" style={{ marginTop: theme.spacing[1] }}>
                        {faction.member_count} medlem{faction.member_count !== 1 ? 'mer' : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <PrimaryButton
                  title="Gå til fraktion →"
                  onPress={() => navigateToDetail(faction.id, faction.name)}
                />
              </Card>
            ))}
          </View>
        )}

        {/* Lokale Fællesskaber Section */}
        {localCommunities.length > 0 && (
          <View style={{ marginBottom: theme.spacing[8] }}>
            <Text variant="caption" style={[styles.sectionTitle, { marginBottom: theme.spacing[3] }]}>LOKALE FÆLLESSKABER</Text>
            {localCommunities.map((community) => (
              <Card key={community.id} style={{ marginBottom: theme.spacing[3] }}>
                <ListRow
                  accent="community"
                  icon="people-circle"
                  title={community.name}
                  subtitle={community.description || 'Ingen beskrivelse'}
                  meta={
                    community.member_count !== undefined
                      ? `${community.member_count} medlem${community.member_count !== 1 ? 'mer' : ''}`
                      : undefined
                  }
                />
                <PrimaryButton
                  title="Gå til fællesskab →"
                  onPress={() => navigateToDetail(community.id, community.name)}
                />
              </Card>
            ))}
          </View>
        )}


        {/* Empty state */}
        {communities.length === 0 && (
          <View style={[styles.emptyState, { paddingVertical: theme.spacing[8] * 2 }]}>
            <Ionicons name="people-outline" size={64} color={theme.colors.text.muted} />
            <Text variant="h3" style={{ marginTop: theme.spacing[4], marginBottom: theme.spacing[1] }}>
              Ingen fællesskaber endnu
            </Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Vær den første til at oprette et!
            </Text>
          </View>
        )}

        {/* Bottom CTA */}
        <Pressable
          style={{
            backgroundColor: theme.colors.pill.yellow.bg,
            borderWidth: 2,
            borderColor: theme.colors.primary,
            borderStyle: 'dashed',
            borderRadius: theme.radius.md,
            padding: theme.spacing[6],
            alignItems: 'center',
          }}
          onPress={() => (navigation as any).navigate('CreateCommunity')}
        >
          <View style={{ alignItems: 'center' }}>
            <Ionicons name="add-circle" size={48} color={theme.colors.primary} />
            <Text variant="h3" style={{ marginTop: theme.spacing[2], marginBottom: theme.spacing[1] }}>
              Mangler dit område?
            </Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center', lineHeight: 20 }}>
              Opret dit eget fællesskab og saml lokale fans
            </Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.pill,
  },
  cardContent: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
  },
});
