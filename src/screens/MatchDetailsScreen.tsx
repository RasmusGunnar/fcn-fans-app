import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { OutlineButton } from '../components/ui/OutlineButton';
import { SectionTitle } from '../components/ui/SectionTitle';
import { ListRowIcon } from '../components/ui/ListRowIcon';
import { InlineComments } from '../components/comments/InlineComments';
import { useAuth } from '../auth/AuthProvider';
import { colors, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { formatDateDa, type Fixture } from '../services/fixtures';
import { fetchFixtureById } from '../services/eventsApi';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;

export default function MatchDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { fixtureId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user, isAppAdmin } = useAuth();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch fixture by ID
  useEffect(() => {
    if (fixtureId) {
      loadFixture();
    }
  }, [fixtureId]);

  const loadFixture = async () => {
    if (!fixtureId) return;
    setLoading(true);
    const data = await fetchFixtureById(fixtureId);
    if (data) {
      setFixture(data as any);
    }
    setLoading(false);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Kampdetaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
          <Text style={styles.loadingText}>Henter kampdata...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Fallback if no fixture provided or found
  if (!fixture) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Kampdetaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Kunne ikke finde kampdata</Text>
          <PrimaryButton title="Gå tilbage" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Kampdetaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {/* Match Card */}
        <Card style={styles.matchCard}>
          <View style={styles.matchRow}>
            <View style={styles.team}>
              {fixture.home_logo_url ? (
                <Image source={{ uri: fixture.home_logo_url }} style={styles.teamLogo} />
              ) : (
                <View style={styles.teamCircle}>
                  <Text style={styles.teamText}>
                    {fixture.home_team.substring(0, 3).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.teamName}>{fixture.home_team}</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={styles.team}>
              {fixture.away_logo_url ? (
                <Image source={{ uri: fixture.away_logo_url }} style={styles.teamLogo} />
              ) : (
                <View style={styles.teamCircle}>
                  <Text style={styles.teamText}>
                    {fixture.away_team.substring(0, 3).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.teamName}>{fixture.away_team}</Text>
            </View>
          </View>
          {(fixture.competition || fixture.round) && (
            <Text style={styles.leagueText}>
              {fixture.competition}
              {fixture.round ? ` - ${fixture.round}` : ''}
            </Text>
          )}
          <View style={styles.divider} />
          <ListRowIcon icon="calendar" title={formatDateDa(fixture.kickoff_at)} />
          {fixture.venue && (
            <ListRowIcon
              icon="location"
              title={fixture.venue}
              subtitle={fixture.venue_city || undefined}
            />
          )}
        </Card>

        {/* CTA Buttons */}
        <View style={styles.ctaRow}>
          <View style={styles.ctaButton}>
            <PrimaryButton title="Køb billet" onPress={() => console.log('Buy ticket')} />
          </View>
          <View style={styles.ctaButton}>
            <OutlineButton title="Rutevejledning" onPress={() => console.log('Route')} />
          </View>
        </View>

        {/* Join CTA */}
        <Pressable style={styles.joinCta}>
          <Ionicons name="person-add" size={24} color={colors.fcnRed} />
          <Text style={styles.joinText}>Deltag (247)</Text>
        </Pressable>

        {/* Fan Activities */}
        <View style={styles.section}>
          <SectionTitle title="FAN AKTIVITETER" />
          <Card style={styles.activitiesCard}>
            <ListRowIcon icon="bus" title="Bustur til Brøndby" subtitle="18. januar 2025" />
            <ListRowIcon icon="restaurant" title="Fælles frokost" subtitle="Før kampen" />
          </Card>
        </View>

        {/* Fan Comments */}
        <View style={styles.section}>
          <InlineComments
            targetType="match"
            targetId={fixture.id}
            currentUserId={user?.id || ''}
            isAppAdmin={isAppAdmin}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.fcnRed,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.card,
  },
  scrollView: {
    flex: 1,
  },
  matchCard: {
    margin: spacing.md,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  teamText: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  loadingText: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: spacing.md,
  },
  vs: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.md,
  },
  leagueText: {
    fontSize: 16,
    color: colors.subtext,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  ctaButton: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  joinCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.fcnRed,
    borderRadius: spacing.md,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  joinText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.fcnRed,
    marginLeft: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  activitiesCard: {
    marginBottom: spacing.md,
  },
  commentsCard: {
    marginBottom: spacing.md,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  commentText: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 2,
  },
});
