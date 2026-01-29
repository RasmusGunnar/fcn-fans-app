import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';
import { getCommunities, Community as CommunityData } from '../services/communities';

export default function CommunitiesScreen() {
  console.log('🚀 DEBUG: CommunitiesScreen LOADED (feat/communities-rbac-avatars)');
  
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  
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
      <View style={styles.container}>
        <AppHeader
          title="Fællesskaber"
          subtitle="Find dit fanfællesskab"
          onPressProfile={() => (navigation as any).navigate('Profile')}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
    >
      <Text style={{ fontSize: 12, opacity: 0.7, padding: spacing.sm }}>DEBUG: Communities v2</Text>
      <AppHeader
        title="Fællesskaber"
        subtitle="Find dit fanfællesskab"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <View style={styles.content}>
        {/* Fan Fraktioner Section */}
        {factions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FAN FRAKTIONER</Text>
            {factions.map((faction) => (
              <Card key={faction.id} style={styles.factionCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    {faction.avatar_url ? (
                      <Image source={{ uri: faction.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="star" size={40} color={colors.fcnRed} />
                    )}
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{faction.name}</Text>
                    <Text style={styles.cardDescription}>
                      {faction.description || 'Ingen beskrivelse'}
                    </Text>
                    {faction.member_count !== undefined && (
                      <Text style={styles.memberCount}>
                        {faction.member_count} medlem{faction.member_count !== 1 ? 'mer' : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <PrimaryButton
                  title="Gå til fraktion →"
                  variant={getButtonVariant(faction.type)}
                  onPress={() => navigateToDetail(faction.id, faction.name)}
                />
              </Card>
            ))}
          </View>
        )}

        {/* Lokale Fællesskaber Section */}
        {localCommunities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LOKALE FÆLLESSKABER</Text>
            {localCommunities.map((community) => (
              <Card key={community.id} style={styles.communityCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    {community.avatar_url ? (
                      <Image
                        source={{ uri: community.avatar_url }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Ionicons name="people-circle" size={40} color={colors.fcnRed} />
                    )}
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{community.name}</Text>
                    <Text style={styles.cardDescription}>
                      {community.description || 'Ingen beskrivelse'}
                    </Text>
                    {community.member_count !== undefined && (
                      <Text style={styles.memberCount}>
                        {community.member_count} medlem{community.member_count !== 1 ? 'mer' : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <PrimaryButton
                  title="Gå til fællesskab →"
                  variant="blue"
                  onPress={() => navigateToDetail(community.id, community.name)}
                />
              </Card>
            ))}
          </View>
        )}

        {/* Empty state */}
        {communities.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.subtext} />
            <Text style={styles.emptyTitle}>Ingen fællesskaber endnu</Text>
            <Text style={styles.emptySubtitle}>Vær den første til at oprette et!</Text>
          </View>
        )}
        {/* Empty state */}
        {communities.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.subtext} />
            <Text style={styles.emptyTitle}>Ingen fællesskaber endnu</Text>
            <Text style={styles.emptySubtitle}>Vær den første til at oprette et!</Text>
          </View>
        )}

        {/* Bottom CTA */}
        <Pressable
          style={styles.ctaCard}
          onPress={() => (navigation as any).navigate('CreateCommunity')}
        >
          <View style={styles.ctaContent}>
            <Ionicons name="add-circle" size={48} color={colors.fcnRed} />
            <Text style={styles.ctaTitle}>Mangler dit område?</Text>
            <Text style={styles.ctaSubtitle}>Opret dit eget fællesskab og saml lokale fans</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
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
  },
  content: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  factionCard: {
    marginBottom: spacing.md,
  },
  communityCard: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    marginRight: spacing.md,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: spacing.sm,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  memberCount: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
  },
  ctaCard: {
    backgroundColor: '#FFF9ED', // Light yellow background
    borderWidth: 2,
    borderColor: '#FCD34D', // Yellow border
    borderStyle: 'dashed',
    borderRadius: spacing.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  ctaContent: {
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
    lineHeight: 20,
  },
});
