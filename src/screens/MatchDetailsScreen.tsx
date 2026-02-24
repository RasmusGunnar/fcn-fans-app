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
import { useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { formatDateDa, type Fixture } from '../services/fixtures';
import { fetchFixtureById } from '../services/eventsApi';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;

export default function MatchDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { fixtureId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user, isAppAdmin } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

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
      // Resolve hero: try raw first, then team API
      let hero = getMatchHeroUrl(data as any);
      if (!hero && data.home_team_provider_id) {
        hero = await getTeamHeroImage(data.home_team_provider_id);
      }
      setHeroUrl(hero);
    }
    setLoading(false);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
        edges={['top']}
      >
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.bg.card }]}>Kampdetaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text.secondary }]}>
            Henter kampdata...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Fallback if no fixture provided or found
  if (!fixture) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
        edges={['top']}
      >
        <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.bg.card }]}>Kampdetaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: theme.colors.text.primary }]}>
            Kunne ikke finde kampdata
          </Text>
          <PrimaryButton title="Gå tilbage" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
      edges={['top']}
    >
      {/* Custom Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.bg.card }]}>Kampdetaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {/* Hero with H2H overlay */}
        {(() => {
          return (
            <View style={styles.heroContainer}>
              {heroUrl ? (
                <Image source={{ uri: heroUrl }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={[styles.heroFallback, { backgroundColor: theme.colors.primary }]} />
              )}
              <View style={styles.heroDarkOverlay} />
              <View style={styles.h2hOverlay}>
                <View style={styles.h2hBadge}>
                  {fixture.home_logo_url ? (
                    <Image
                      source={{ uri: fixture.home_logo_url }}
                      style={styles.h2hLogoImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={[styles.teamText, { color: theme.colors.primary }]}>
                      {fixture.home_team.substring(0, 3).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={[styles.h2hVsText, { color: theme.colors.text.inverse }]}>VS</Text>
                <View style={styles.h2hBadge}>
                  {fixture.away_logo_url ? (
                    <Image
                      source={{ uri: fixture.away_logo_url }}
                      style={styles.h2hLogoImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={[styles.teamText, { color: theme.colors.primary }]}>
                      {fixture.away_team.substring(0, 3).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        {/* Match Info Card */}
        <Card style={styles.matchCard}>
          {(fixture.competition || fixture.round) && (
            <Text style={[styles.leagueText, { color: theme.colors.text.secondary }]}>
              {fixture.competition}
              {fixture.round ? ` - ${fixture.round}` : ''}
            </Text>
          )}
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
        <Pressable
          style={[
            styles.joinCta,
            { backgroundColor: theme.colors.bg.card, borderColor: theme.colors.primary },
          ]}
        >
          <Ionicons name="person-add" size={24} color={theme.colors.primary} />
          <Text style={[styles.joinText, { color: theme.colors.primary }]}>Deltag (247)</Text>
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
            variant="screen"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    backButton: {
      marginRight: spacing.sm,
    },
    headerTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
    },
    scrollView: {
      flex: 1,
    },
    heroContainer: {
      width: '100%',
      height: 200,
      position: 'relative',
      overflow: 'hidden',
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    heroFallback: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.85,
    },
    heroDarkOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay.heroScrim,
    },
    h2hOverlay: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    h2hBadge: {
      width: theme.spacing[14],
      height: theme.spacing[14],
      borderRadius: theme.radius.pill,
      backgroundColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    h2hLogoImg: {
      width: theme.spacing[14],
      height: theme.spacing[14],
    },
    h2hVsText: {
      fontSize: theme.typography.h1.fontSize,
      fontWeight: '800',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
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
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    teamLogo: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
    },
    teamName: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    teamText: {
      fontSize: theme.typography.h2.fontSize,
      fontWeight: '700',
    },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    errorText: {
      fontSize: theme.typography.body.fontSize,
      marginBottom: spacing.lg,
    },
    loadingText: {
      fontSize: theme.typography.body.fontSize,
      marginTop: spacing.md,
    },
    vs: {
      fontSize: theme.typography.h2.fontSize,
      fontWeight: '700',
      marginHorizontal: spacing.md,
    },
    leagueText: {
      fontSize: theme.typography.body.fontSize,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    divider: {
      height: theme.layout.borderWidth,
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
      borderWidth: theme.layout.borderWidth,
      borderRadius: theme.radius.md,
      paddingVertical: spacing.lg,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    joinText: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '600',
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
      borderBottomWidth: theme.layout.borderWidth,
    },
    avatar: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    avatarText: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
    },
    commentContent: {
      flex: 1,
    },
    commentAuthor: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
    },
    commentText: {
      fontSize: theme.typography.body.fontSize,
      marginTop: theme.spacing[0],
    },
  });
