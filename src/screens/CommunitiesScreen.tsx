import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

const factionData = [
  {
    id: '1',
    name: 'Vilde Tigre',
    members: 234,
    description: 'De mest passionerede fans der støtter holdet uanset hvad.',
    buttonColor: 'red' as const,
  },
  {
    id: '2',
    name: 'Farum Fighters',
    members: 189,
    description: 'Lokale fans fra Farum der kæmper for sejren hver kamp.',
    buttonColor: 'blue' as const,
  },
  {
    id: '3',
    name: 'Nordsjælland United',
    members: 156,
    description: 'Sammenhold og fællesskab for alle FCN-fans.',
    buttonColor: 'yellow' as const,
  },
];

const localCommunityData = [
  {
    id: '4',
    name: 'Ganløse Fans',
    members: 67,
    description: 'Fans fra Ganløse-området.',
  },
  {
    id: '5',
    name: 'Helsinge Supporters',
    members: 43,
    description: 'Støtter holdet fra Helsinge.',
  },
  {
    id: '6',
    name: 'Farum Fans',
    members: 156,
    description: 'Dedikerede fans fra Farum.',
  },
  {
    id: '7',
    name: 'Udebane-Crew',
    members: 89,
    description: 'Rejser med holdet på udebane.',
  },
];

export default function CommunitiesScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  const navigateToDetail = (id: string, title: string) => {
    (navigation as any).navigate('CommunityDetail', { id, title });
  };

  const getButtonVariant = (color: string) => {
    switch (color) {
      case 'blue':
        return 'blue';
      case 'yellow':
        return 'yellow';
      default:
        return 'red';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
    >
      <AppHeader
        title="Fællesskaber"
        subtitle="Find dit fanfællesskab"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <View style={styles.content}>
        {/* Fan Fraktioner Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FAN FRAKTIONER</Text>
          {factionData.map((faction) => (
            <Card key={faction.id} style={styles.factionCard}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Ionicons name="star" size={40} color={colors.fcnRed} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{faction.name}</Text>
                  <Text style={styles.cardMeta}>{faction.members} medlemmer</Text>
                  <Text style={styles.cardDescription}>{faction.description}</Text>
                </View>
              </View>
              <PrimaryButton
                title="Gå til fraktion →"
                variant={getButtonVariant(faction.buttonColor)}
                onPress={() => navigateToDetail(faction.id, faction.name)}
              />
            </Card>
          ))}
        </View>

        {/* Lokale Fællesskaber Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOKALE FÆLLESSKABER</Text>
          {localCommunityData.map((community) => (
            <Card key={community.id} style={styles.communityCard}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Ionicons name="people-circle" size={40} color={colors.fcnRed} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{community.name}</Text>
                  <Text style={styles.cardMeta}>{community.members} medlemmer</Text>
                  <Text style={styles.cardDescription}>{community.description}</Text>
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

        {/* Bottom CTA */}
        <Pressable style={styles.ctaCard} onPress={() => console.log('Create community')}>
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
