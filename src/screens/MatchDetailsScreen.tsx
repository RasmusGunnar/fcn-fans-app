import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { InlineComments } from '../components/comments/InlineComments';
import { CarpoolSummary } from '../components/carpool/CarpoolSummary';
import { FanActivityDetailSheet } from '../components/fan/FanActivityDetailSheet';
import { MatchAttendancePanel } from '../components/match/MatchAttendancePanel';
import { MatchHero } from '../components/match/MatchHero';
import { MatchdayEntry } from '../components/match/MatchdayEntry';
import { matchdayExperience } from '../utils/matchdayExperience';
import { matchExperience } from '../utils/fanExperience';
import { PrimaryButton } from '../components/PrimaryButton';
import { FanActivitiesShowcase } from '../components/fan/FanActivitiesShowcase';
import { Card } from '../components/ui/Card';
import type { RootStackParamList } from '../navigation/types';
import { fetchFixtureById, type Fixture } from '../services/eventsApi';
import {
  fetchManageableFanActivityCommunities,
  fetchFanActivitiesForMatch,
  type FanActivity,
} from '../services/fanActivities';
import { formatDateDa } from '../services/fixtures';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { isDemoMode } from '../config/appMode';
import { DEMO_MEDIA_FILES, demoMediaUrl } from '../demo/media';
import { resolveDemoMediaAssetUri } from '../demo/mediaAssets';
import { navigateToStadiumLive } from '../navigation/navigationRef';
import { useMatchdayState } from '../state/MatchdayStateContext';
import { spacing, useTheme } from '../theme';
import { buildMatchMapsUrl, FCN_TICKET_URL, isFcnHomeMatch } from '../utils/matchLinks';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;

function formatCountdownLabel(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart 🔥';
  if (diffHours < 48) return `Starter om ${Math.ceil(diffHours)} timer`;
  return `Starter om ${Math.ceil(diffHours / 24)} dage`;
}

export default function MatchDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { fixtureId, fanActivityId } = route.params || {};
  const requestedFanActivityId = fanActivityId?.trim() || null;
  const insets = useSafeAreaInsets();
  const { user, isAppAdmin } = useAuth();
  const theme = useTheme();
  const styles = stylesFactory(theme);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [fanActivities, setFanActivities] = useState<FanActivity[]>([]);
  const [selectedFanActivity, setSelectedFanActivity] = useState<FanActivity | null>(null);
  const [canCreateFanActivities, setCanCreateFanActivities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const autoOpenedFanActivityIdRef = useRef<string | null>(null);
  const matchdayState = useMatchdayState(fixtureId);
  const refreshMatchdayState = matchdayState.refresh;
  const loadFixture = useCallback(async () => {
    if (!fixtureId) return;
    setLoading(true);
    const data = await fetchFixtureById(fixtureId);
    if (data) {
      setFixture(data);
      let hero = isDemoMode
        ? resolveDemoMediaAssetUri(demoMediaUrl(DEMO_MEDIA_FILES.stand))
        : getMatchHeroUrl(data);
      const homeTeamHeroId = data.home_team_provider_id ?? data.home_team_id ?? null;
      if (!isDemoMode && !hero && homeTeamHeroId) {
        hero = await getTeamHeroImage(homeTeamHeroId);
      }
      setHeroUrl(hero);
    }
    setLoading(false);
  }, [fixtureId]);

  const loadFanActivities = useCallback(async () => {
    if (!fixtureId) {
      setFanActivities([]);
      return;
    }

    const data = await fetchFanActivitiesForMatch(fixtureId);
    setFanActivities(data);
  }, [fixtureId]);

  useEffect(() => {
    if (fixtureId) {
      loadFixture();
    }
  }, [fixtureId, loadFixture]);

  useEffect(() => {
    let isActive = true;

    if (!fixtureId) {
      setFanActivities([]);
      return () => {
        isActive = false;
      };
    }

    setFanActivities([]);

    (async () => {
      const data = await fetchFanActivitiesForMatch(fixtureId);
      if (!isActive) return;
      setFanActivities(data);
    })();

    return () => {
      isActive = false;
    };
  }, [fixtureId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void loadFanActivities();
      void refreshMatchdayState().catch(() => undefined);
    });

    return unsubscribe;
  }, [loadFanActivities, navigation, refreshMatchdayState]);

  useEffect(() => {
    autoOpenedFanActivityIdRef.current = null;
  }, [fixtureId, requestedFanActivityId]);

  useEffect(() => {
    if (!requestedFanActivityId || fanActivities.length === 0) {
      return;
    }

    if (autoOpenedFanActivityIdRef.current === requestedFanActivityId) {
      return;
    }

    const matchedActivity = fanActivities.find(
      (activity) => activity.id === requestedFanActivityId,
    );
    if (!matchedActivity) {
      return;
    }

    autoOpenedFanActivityIdRef.current = requestedFanActivityId;
    setSelectedFanActivity(matchedActivity);
  }, [fanActivities, requestedFanActivityId]);

  useEffect(() => {
    let isActive = true;

    const loadCreateCapability = async () => {
      if (!user?.id || !fixtureId) {
        if (isActive) {
          setCanCreateFanActivities(false);
        }
        return;
      }

      const communities = await fetchManageableFanActivityCommunities(user.id, {
        communityType: 'fan_faction',
      });

      if (isActive) {
        setCanCreateFanActivities(communities.length > 0);
      }
    };

    void loadCreateCapability();

    return () => {
      isActive = false;
    };
  }, [fixtureId, user?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const handleDeleteFanActivity = useCallback(
    (fanActivityId: string) => {
      setFanActivities((current) => current.filter((activity) => activity.id !== fanActivityId));
      setSelectedFanActivity((current) => (current?.id === fanActivityId ? null : current));
      void loadFanActivities();
    },
    [loadFanActivities],
  );

  const experience = matchExperience(
    fixture?.status_short,
    fixture?.kickoff_at ?? '',
    now.getTime(),
  );
  const [planningOpen, setPlanningOpen] = useState(false);
  useEffect(() => {
    if (!fixtureId || !experience.conversationFirst || experience.state === 'POST_MATCH') return;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      void fetchFixtureById(fixtureId).then((value) => {
        if (value) setFixture(value);
      });
      void refreshMatchdayState().catch(() => undefined);
    };
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [fixtureId, experience.conversationFirst, experience.state, refreshMatchdayState]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
        edges={['top']}
      >
        <View style={[styles.header, { backgroundColor: theme.colors.bg.default }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tilbage"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>
            Kampdetaljer
          </Text>
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

  if (!fixture) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
        edges={['top']}
      >
        <View style={[styles.header, { backgroundColor: theme.colors.bg.default }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tilbage"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>
            Kampdetaljer
          </Text>
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

  const isHomeMatch = isFcnHomeMatch(fixture);
  const mapsUrl = buildMatchMapsUrl(fixture);
  const competitionLabel = [fixture.competition, fixture.round].filter(Boolean).join(' · ');
  const countdownLabel =
    experience.label === 'Før kampen'
      ? formatCountdownLabel(fixture.kickoff_at, now)
      : experience.label;
  const showFanActivitiesSection = fanActivities.length > 0 || canCreateFanActivities;
  const matchLocationLabel =
    [fixture.venue, fixture.venue_city].filter(Boolean).join(' · ') || null;

  const handleOpenRoute = async () => {
    if (!mapsUrl) return;
    try {
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('[MatchDetails] Route open error:', error);
      Alert.alert('Fejl', 'Kunne ikke åbne kortet.');
    }
  };

  const handleOpenTickets = async () => {
    if (!isHomeMatch) return;
    try {
      await Linking.openURL(FCN_TICKET_URL);
    } catch (error) {
      console.error('[MatchDetails] Ticket open error:', error);
      Alert.alert('Fejl', 'Kunne ikke åbne billetsiden.');
    }
  };

  const handleOpenMatchFans = () => {
    navigateToStadiumLive(fixture.id);
  };

  const handleCreateFanActivity = () => {
    if (!fixtureId) return;

    (navigation as any).navigate('CreateFanActivity', {
      parentType: 'match',
      parentId: fixtureId,
    });
  };

  const handleOpenFanActivity = (activity: FanActivity) => {
    setSelectedFanActivity(activity);
  };

  const handleCloseFanActivity = () => {
    setSelectedFanActivity(null);
  };

  const participation = (
    <View>
      <MatchAttendancePanel
        matchCenter
        state={matchdayState}
        planningAllowed={experience.planningAllowed}
        setRsvp={matchdayState.setRsvpStatus}
        checkIn={matchdayState.checkIn}
        checkOut={matchdayState.checkOut}
      />
      {!matchdayExperience(matchdayState, experience.planningAllowed).open ? (
        <Text style={{ padding: theme.spacing[3], color: theme.colors.text.secondary }}>
          {experience.planningAllowed ? 'Kampdag åbner i kampvinduet' : 'Kampdag er afsluttet'}
        </Text>
      ) : null}
    </View>
  );
  const conversation = (
    <View style={styles.section}>
      <Card style={styles.commentsZoneCard}>
        <View style={styles.commentsIntro}>
          <Text style={styles.commentsIntroTitle}>
            {experience.state === 'LIVE' ? 'Kampsnak LIVE' : 'Kampsnak'}
          </Text>
          <Text style={styles.commentsIntroBody}>
            {experience.state === 'POST_MATCH'
              ? 'Slutfløjt — samtalen fortsætter.'
              : experience.preLive
                ? 'Kampdag — del forventningerne før kickoff.'
                : 'Del kampen med de andre fans.'}
          </Text>
        </View>
        <InlineComments
          targetType="match"
          targetId={fixture.id}
          currentUserId={user?.id || ''}
          isAppAdmin={isAppAdmin}
          variant="inline"
          maxInlineComments={8}
          titleOverride="Kampsnak"
          latestFirst
          refreshIntervalMs={
            experience.conversationFirst && experience.state !== 'POST_MATCH' ? 60_000 : undefined
          }
          composerPlaceholder="Skriv i kampsnak …"
          replyModeLabel="Svar"
        />
      </Card>
    </View>
  );
  const planning = (
    <View>
      {experience.conversationFirst ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: planningOpen }}
          onPress={() => setPlanningOpen((value) => !value)}
          style={{ paddingVertical: 16 }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
            {planningOpen ? 'Skjul' : 'Vis'} fanaktiviteter og kampkontekst
          </Text>
        </Pressable>
      ) : null}
      {!experience.conversationFirst || planningOpen ? (
        <>
          {showFanActivitiesSection ? (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionEyebrow}>KAMPDAGSLAG</Text>
                  <Text style={[styles.sectionHeading, styles.sectionHeadingCompact]}>
                    FANAKTIVITETER
                  </Text>
                </View>
                {canCreateFanActivities ? (
                  <Pressable style={styles.sectionCta} onPress={handleCreateFanActivity}>
                    <Ionicons
                      name="add"
                      size={theme.components.icon.size.sm}
                      color={theme.colors.text.secondary}
                    />
                    <Text style={styles.sectionCtaText}>Tilføj fanaktivitet</Text>
                  </Pressable>
                ) : null}
              </View>
              <Card style={styles.activitiesCard}>
                <FanActivitiesShowcase
                  activities={fanActivities}
                  onPressActivity={handleOpenFanActivity}
                />
              </Card>
            </View>
          ) : null}
          <View style={styles.utilityActionsWrap}>
            <View style={styles.utilityActionsRow}>
              <Pressable
                onPress={handleOpenTickets}
                disabled={!isHomeMatch}
                style={({ pressed }) => [
                  styles.utilityActionButton,
                  !isHomeMatch ? styles.utilityActionButtonDisabled : null,
                  pressed && isHomeMatch ? styles.utilityActionPressed : null,
                ]}
              >
                <Ionicons
                  name="ticket-outline"
                  size={theme.components.icon.size.sm}
                  color={isHomeMatch ? theme.colors.text.primary : theme.colors.text.muted}
                />
                <Text
                  style={[
                    styles.utilityActionText,
                    !isHomeMatch ? styles.utilityActionTextDisabled : null,
                  ]}
                >
                  Køb billet
                </Text>
              </Pressable>

              <Pressable
                onPress={handleOpenRoute}
                disabled={!mapsUrl}
                style={({ pressed }) => [
                  styles.utilityActionButton,
                  !mapsUrl ? styles.utilityActionButtonDisabled : null,
                  pressed && mapsUrl ? styles.utilityActionPressed : null,
                ]}
              >
                <Ionicons
                  name="navigate-outline"
                  size={theme.components.icon.size.sm}
                  color={mapsUrl ? theme.colors.text.primary : theme.colors.text.muted}
                />
                <Text
                  style={[
                    styles.utilityActionText,
                    !mapsUrl ? styles.utilityActionTextDisabled : null,
                  ]}
                >
                  Vejvisning
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
  const modules = experience.conversationFirst
    ? [
        { key: 'conversation', content: conversation },
        { key: 'participation', content: participation },
        { key: 'planning', content: planning },
      ]
    : [
        { key: 'participation', content: participation },
        { key: 'planning', content: planning },
        { key: 'conversation', content: conversation },
      ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.bg.default }]}
      edges={['top']}
    >
      <View style={[styles.header, { backgroundColor: theme.colors.bg.default }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>Kampdetaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        <View style={styles.heroShell}>
          <MatchHero
            energized={matchdayExperience(matchdayState, experience.planningAllowed).open}
            imageUrl={heroUrl}
            homeTeam={fixture.home_team}
            awayTeam={fixture.away_team}
            homeLogo={fixture.home_logo_url}
            awayLogo={fixture.away_logo_url}
            badge={[isHomeMatch ? 'Hjemmekamp' : 'Udekamp', competitionLabel]
              .filter(Boolean)
              .join(' · ')}
            status={countdownLabel}
            date={formatDateDa(fixture.kickoff_at)}
            venue={matchLocationLabel}
            centerLabel={
              experience.showScore &&
              typeof fixture.home_goals === 'number' &&
              typeof fixture.away_goals === 'number'
                ? `${fixture.home_goals} – ${fixture.away_goals}`
                : experience.state === 'LIVE'
                  ? 'LIVE'
                  : experience.state === 'POST_MATCH'
                    ? 'SLUT'
                    : 'VS'
            }
          />
          <MatchdayEntry
            state={matchdayExperience(matchdayState, experience.planningAllowed)}
            onPress={handleOpenMatchFans}
          />
        </View>
        <View style={styles.contentBlock}>
          <CarpoolSummary fixtureId={fixtureId} />
          {modules.map((module) => (
            <View key={module.key}>{module.content}</View>
          ))}
        </View>
      </ScrollView>
      <FanActivityDetailSheet
        visible={Boolean(selectedFanActivity)}
        activity={selectedFanActivity}
        onClose={handleCloseFanActivity}
        onDeleted={handleDeleteFanActivity}
      />
    </SafeAreaView>
  );
}

const stylesFactory = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
    },
    backButton: {
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      marginRight: 4,
    },
    headerTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
    },
    scrollView: {
      flex: 1,
    },
    heroShell: { marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden' },
    contentBlock: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
    topExperienceShell: {
      marginTop: -theme.spacing[8],
      zIndex: 2,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      padding: theme.layout.cardPadding,
      gap: theme.spacing[3],
      overflow: 'hidden',
    },
    matchInfoBlock: {
      gap: theme.spacing[2],
    },
    matchInfoCard: {
      marginBottom: theme.spacing[0],
    },
    matchInfoEyebrow: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      letterSpacing: 0.5,
    },
    matchInfoDetails: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[3],
    },
    matchInfoIconBlock: {
      width: theme.spacing[9],
      height: theme.spacing[9],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.default,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    matchInfoContent: {
      flex: 1,
      gap: theme.spacing[1],
    },
    statusPanelWrap: {
      gap: spacing.xs,
    },
    statusPanel: {
      marginBottom: theme.spacing[0],
    },
    participationModule: {
      gap: theme.spacing[2] + theme.spacing[1] / 2,
    },
    utilityActionsWrap: {
      paddingTop: theme.spacing[2],
    },
    stadiumLiveAction: {
      minHeight: theme.spacing[14],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.default,
    },
    stadiumLiveActionIcon: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    stadiumLiveActionCopy: {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing[0],
    },
    stadiumLiveActionTitle: {
      color: theme.colors.text.primary,
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
    },
    stadiumLiveActionBody: {
      color: theme.colors.text.secondary,
      fontSize: theme.typography.small.fontSize,
    },
    utilityActionsRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      alignSelf: 'stretch',
      alignItems: 'stretch',
    },
    utilityActionButton: {
      minHeight: theme.spacing[6],
      flex: 1,
      flexBasis: 0,
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.default,
      paddingHorizontal: theme.spacing[2] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] / 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: theme.spacing[1],
    },
    utilityActionButtonDisabled: {
      backgroundColor: theme.colors.bg.subtle,
      borderColor: theme.colors.border.light,
    },
    utilityActionPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.98 }],
    },
    utilityActionText: {
      color: theme.colors.text.primary,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      textAlign: 'center',
    },
    utilityActionTextDisabled: {
      color: theme.colors.text.muted,
    },
    statusPanelError: {
      marginTop: spacing.xs,
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.error,
    },
    matchInfoTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '800',
      color: theme.colors.text.primary,
    },
    matchInfoMeta: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    matchInfoVenue: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    section: {
      marginBottom: spacing.sm,
    },
    commentsZoneCard: {
      paddingHorizontal: theme.spacing[0],
      paddingVertical: theme.spacing[0],
      overflow: 'hidden',
    },
    sectionHeading: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      marginBottom: spacing.sm,
      letterSpacing: 0.5,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    sectionHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionEyebrow: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      letterSpacing: 0.5,
      marginBottom: theme.spacing[1],
    },
    sectionHeadingCompact: {
      marginBottom: theme.spacing[0],
    },
    sectionCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    sectionCtaText: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    activitiesCard: {
      marginBottom: theme.spacing[0],
    },
    commentsIntro: {
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    commentsIntroTitle: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
      fontWeight: '700',
      marginBottom: theme.spacing[1],
    },
    commentsIntroBody: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      lineHeight: theme.spacing[4],
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
  });
