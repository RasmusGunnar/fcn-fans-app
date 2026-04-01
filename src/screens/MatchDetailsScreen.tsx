import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
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
import { FanActivityDetailSheet } from '../components/fan/FanActivityDetailSheet';
import { MatchdayStatusPanel } from '../components/match/MatchdayStatusPanel';
import { PrimaryButton } from '../components/PrimaryButton';
import { FanActivitiesShowcase } from '../components/fan/FanActivitiesShowcase';
import { Card } from '../components/ui/Card';
import type { RootStackParamList } from '../navigation/types';
import { fetchFixtureById, type Fixture } from '../services/eventsApi';
import {
  fetchFanActivitiesForMatch,
  resolveCreateFanActivityCommunity,
  type FanActivity,
} from '../services/fanActivities';
import { formatDateDa } from '../services/fixtures';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { useAttendance } from '../hooks/useAttendance';
import { useMatchCheckIn } from '../hooks/useMatchCheckIn';
import { spacing, useTheme } from '../theme';
import { buildMatchMapsUrl, FCN_TICKET_URL, isFcnHomeMatch } from '../utils/matchLinks';
import { getMatchdayTiming, getMatchViewState } from '../utils/matchdayState';
import { applyMatchdayPreview } from '../utils/matchdayPreview';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
type MatchParticipationChoice = 'going' | 'not_going' | null;

function formatCountdownLabel(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart 🔥';
  if (diffHours < 48) return `Starter om ${Math.ceil(diffHours)} timer`;
  return `Starter om ${Math.ceil(diffHours / 24)} dage`;
}

function MatchStatusChip({ label }: { label: string }) {
  const theme = useTheme();
  const styles = stylesFactory(theme);

  return (
    <View style={styles.matchStatusChip}>
      <Text style={styles.matchStatusChipText}>{label}</Text>
    </View>
  );
}

function MatchChipRow({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = stylesFactory(theme);
  return <View style={styles.heroChipRow}>{children}</View>;
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
  const [participationChoice, setParticipationChoice] = useState<MatchParticipationChoice>(null);
  const heroPulse = useRef(new Animated.Value(1)).current;
  const checkInPulse = useRef(new Animated.Value(0)).current;
  const autoOpenedFanActivityIdRef = useRef<string | null>(null);
  const attendance = useAttendance({ entityType: 'match', entityId: fixtureId });
  const matchCheckIn = useMatchCheckIn(fixtureId, fixture?.kickoff_at ?? null);

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
  }, [fixtureId]);

  useEffect(() => {
    setParticipationChoice(null);
  }, [fixtureId]);

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
    });

    return unsubscribe;
  }, [loadFanActivities, navigation]);

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

    const matchedActivity = fanActivities.find((activity) => activity.id === requestedFanActivityId);
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

      const resolution = await resolveCreateFanActivityCommunity({
        userId: user.id,
        parentType: 'match',
      });

      if (isActive) {
        setCanCreateFanActivities(Boolean(resolution.community?.id));
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

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, {
          toValue: 1.03,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(heroPulse, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [heroPulse]);

  useEffect(() => {
    if (attendance.isGoing) {
      setParticipationChoice('going');
    }
  }, [attendance.isGoing]);

  useEffect(() => {
    if (!matchCheckIn.isCheckedIn) return;

    checkInPulse.setValue(0);
    Animated.sequence([
      Animated.timing(checkInPulse, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(checkInPulse, {
        toValue: 0.7,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkInPulse, matchCheckIn.isCheckedIn]);

  const loadFixture = async () => {
    if (!fixtureId) return;
    setLoading(true);
    const data = await fetchFixtureById(fixtureId);
    if (data) {
      setFixture(data);
      let hero = getMatchHeroUrl(data);
      const homeTeamHeroId = data.home_team_provider_id ?? data.home_team_id ?? null;
      if (!hero && homeTeamHeroId) {
        hero = await getTeamHeroImage(homeTeamHeroId);
      }
      setHeroUrl(hero);
    }
    setLoading(false);
  };

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

  const isHomeMatch = isFcnHomeMatch(fixture);
  const mapsUrl = buildMatchMapsUrl(fixture);
  const competitionLabel = [fixture.competition, fixture.round].filter(Boolean).join(' · ');
  const countdownLabel = formatCountdownLabel(fixture.kickoff_at, now);
  const liveMatchdayState = getMatchdayTiming(fixture.kickoff_at, now);
  const matchdayState = applyMatchdayPreview(liveMatchdayState);
  const baseIsGoingToMatch = participationChoice === 'going' || attendance.isGoing;
  const matchViewState = getMatchViewState({
    isMatchday: matchdayState.isMatchday,
    isGoing: baseIsGoingToMatch,
    isCheckedIn: matchCheckIn.isCheckedIn,
  });
  const isGoingToMatch = baseIsGoingToMatch || matchViewState === 'checked_in_confirmed';
  const matchInfoStatusText =
    matchViewState === 'matchday_action'
      ? baseIsGoingToMatch
        ? 'Du har sagt, at du kommer - klar til at tjekke ind?'
        : participationChoice === 'not_going'
          ? 'Har du alligevel taget turen? Tjek ind her.'
          : 'Er du på stadion? Tjek ind her.'
      : isGoingToMatch
        ? 'Du kommer til kampen'
        : participationChoice === 'not_going'
          ? 'Du deltager ikke i kampen'
          : 'Vælg om du deltager';
  const showFanActivitiesSection = fanActivities.length > 0 || canCreateFanActivities;

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

  const handleOpenAttendees = () => {
    (navigation as any).navigate('EventAttendees', {
      entityId: fixture.id,
      entityType: 'match',
      title: 'Fans der kommer',
    });
  };

  const handleOpenCheckedInFans = () => {
    (navigation as any).navigate('EventAttendees', {
      entityId: fixture.id,
      entityType: 'match',
      title: 'Tjekket ind på stadion',
      mode: 'checkin',
    });
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

  const handleSelectParticipation = async (choice: Exclude<MatchParticipationChoice, null>) => {
    setParticipationChoice(choice);

    if (choice === 'going') {
      if (!attendance.isGoing) {
        await attendance.toggleGoing();
      }
      return;
    }

    if (attendance.isGoing) {
      await attendance.toggleGoing();
    }
  };

  const handleCheckIn = async () => {
    try {
      await matchCheckIn.checkIn();
    } catch {
      Alert.alert('Fejl', 'Kunne ikke gennemføre check-in.');
    }
  };

  const renderStatusPanel = () => {
    const checkInConfirmationStyle = {
      opacity: checkInPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.92],
      }),
      transform: [
        {
          scale: checkInPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.03],
          }),
        },
      ],
    };
    const usesAttendanceSocial =
      matchViewState !== 'matchday_action' && matchViewState !== 'checked_in_confirmed';
    const panelCount = usesAttendanceSocial ? attendance.countGoing : matchCheckIn.countCheckedIn;
    const panelAvatars = usesAttendanceSocial ? attendance.avatars : matchCheckIn.avatars;
    const panelSecondarySelected = usesAttendanceSocial && participationChoice === 'not_going';
    const panelPrimaryLabel =
      matchViewState === 'checked_in_confirmed'
        ? undefined
        : matchViewState === 'matchday_action'
          ? matchCheckIn.loading
            ? 'Tjekker ind...'
            : 'Tjek ind'
          : panelSecondarySelected
            ? 'Jeg kommer'
            : isGoingToMatch
              ? 'Du kommer'
              : 'Jeg kommer';
    const panelPrimaryDisabled =
      matchViewState === 'checked_in_confirmed'
          ? true
        : matchViewState === 'matchday_action'
          ? matchCheckIn.loading
          : attendance.loading;
    const panelSecondaryLabel = usesAttendanceSocial ? 'Kan ikke komme' : undefined;
    const panelSecondaryDisabled = usesAttendanceSocial ? attendance.loading : true;
    const panel = (
      <MatchdayStatusPanel
        viewState={matchViewState}
        isGoing={isGoingToMatch}
        avatars={panelAvatars}
        count={panelCount}
        primaryLabel={panelPrimaryLabel}
        primaryDisabled={panelPrimaryDisabled}
        secondaryLabel={panelSecondaryLabel}
        secondaryDisabled={panelSecondaryDisabled}
        secondarySelected={panelSecondarySelected}
        simpleParticipationModel
        onPressPrimary={
          matchViewState === 'matchday_action'
            ? handleCheckIn
            : () => handleSelectParticipation('going')
        }
        onPressSecondary={
          usesAttendanceSocial
            ? () => handleSelectParticipation('not_going')
            : undefined
        }
        onPressSocial={
          usesAttendanceSocial ? handleOpenAttendees : handleOpenCheckedInFans
        }
        style={styles.statusPanel}
      />
    );

    return (
      <View style={styles.statusPanelWrap}>
        {matchViewState === 'checked_in_confirmed' ? (
          <Animated.View style={checkInConfirmationStyle}>{panel}</Animated.View>
        ) : (
          panel
        )}
        {matchCheckIn.error ? (
          <Text style={styles.statusPanelError}>{matchCheckIn.error}</Text>
        ) : null}
      </View>
    );
  };

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

      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        <View style={styles.heroContainer}>
          {heroUrl ? (
            <Image source={{ uri: heroUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: theme.colors.primary }]} />
          )}
          <View
            style={[
              styles.heroDarkOverlay,
              matchdayState.isMatchday ? styles.heroDarkOverlayMatchday : null,
            ]}
          />

          <View style={styles.heroTopRow}>
            <MatchChipRow>
              <MatchStatusChip label={isHomeMatch ? 'Hjemmekamp' : 'Udekamp'} />
              {competitionLabel ? <MatchStatusChip label={competitionLabel} /> : null}
            </MatchChipRow>
          </View>

          <Animated.View style={[styles.h2hOverlay, { transform: [{ scale: heroPulse }] }]}>
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
          </Animated.View>

          <View style={styles.countdownWrap}>
            <Text style={styles.countdownText}>{countdownLabel}</Text>
          </View>

          <View style={styles.heroBottomGradient} />
        </View>

        <View style={styles.contentBlock}>
          <Card style={styles.matchInfoCard}>
            <Text style={styles.matchInfoEyebrow}>Næste kamp</Text>
            <Text style={styles.matchInfoTitle}>
              {fixture.home_team} vs {fixture.away_team}
            </Text>
            <View style={styles.matchInfoDetails}>
              <View style={styles.matchInfoIconBlock}>
                <Ionicons
                  name="location-outline"
                  size={theme.components.icon.size.md}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.matchInfoContent}>
                {fixture.venue ? (
                  <Text style={styles.matchInfoVenue}>
                    {fixture.venue}
                    {fixture.venue_city ? ` · ${fixture.venue_city}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.matchInfoMeta}>{formatDateDa(fixture.kickoff_at)}</Text>
                <Text style={styles.matchInfoStatus}>{matchInfoStatusText}</Text>
              </View>
            </View>
          </Card>

          <View style={styles.participationModule}>
            {renderStatusPanel()}
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

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>FAN ZONE</Text>
            <Card style={styles.commentsZoneCard}>
              <View style={styles.commentsIntro}>
                <Text style={styles.commentsIntroTitle}>Kampsnak</Text>
                <Text style={styles.commentsIntroBody}>
                  Del forventningerne til kampen og fang stemningen med de andre fans.
                </Text>
              </View>
              <InlineComments
                targetType="match"
                targetId={fixture.id}
                currentUserId={user?.id || ''}
                isAppAdmin={isAppAdmin}
                variant="inline"
                maxInlineComments={Infinity}
                titleOverride="Kampsnak"
                composerPlaceholder="Del stemningen før kamp..."
                quickActionMode="submit"
                quickActionFeedbackForValue={(value) =>
                  value === 'Jeg er på vej' ? 'Du er på vej 🔴' : 'Du deltager i snakken'
                }
                replyModeLabel="Svar"
                quickActionChips={[
                  'Jeg er på vej',
                  'Mødes før kamp?',
                  'Hvem er på stadion?',
                  'Mit bud på kampen',
                ]}
              />
            </Card>
          </View>
        </View>
      </ScrollView>
      <FanActivityDetailSheet
        visible={Boolean(selectedFanActivity)}
        activity={selectedFanActivity}
        onClose={handleCloseFanActivity}
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
      height: theme.spacing[16] + theme.spacing[16] + theme.spacing[10],
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
    heroDarkOverlayMatchday: {
      backgroundColor: theme.colors.overlay.heroScrim,
      opacity: 0.92,
    },
    heroTopRow: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      right: spacing.md,
      zIndex: 2,
    },
    heroChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.xs,
    },
    matchStatusChip: {
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.medium,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.overlay.light,
    },
    matchStatusChipText: {
      color: theme.colors.text.inverse,
      fontWeight: '700',
      fontSize: theme.typography.caption.fontSize,
    },
    h2hOverlay: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      paddingTop: theme.spacing[16],
      paddingBottom: theme.spacing[16],
    },
    h2hBadge: {
      width: theme.spacing[16] + theme.spacing[10],
      height: theme.spacing[16] + theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: 'transparent',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    h2hLogoImg: {
      width: theme.spacing[16] + theme.spacing[10],
      height: theme.spacing[16] + theme.spacing[10],
    },
    h2hVsText: {
      fontSize: theme.typography.h2.fontSize,
      fontWeight: '800',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    countdownWrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: theme.spacing[16] - spacing.sm,
      alignItems: 'center',
      zIndex: 2,
    },
    countdownText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      backgroundColor: theme.colors.overlay.medium,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
    },
    heroBottomGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: theme.spacing[16],
      backgroundColor: theme.colors.overlay.heroScrim,
      zIndex: 2,
    },
    contentBlock: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      gap: spacing.md,
    },
    matchInfoCard: {
      marginBottom: theme.spacing[0],
    },
    matchInfoEyebrow: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    matchInfoDetails: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    matchInfoIconBlock: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    matchInfoContent: {
      flex: 1,
    },
    statusPanelWrap: {
      gap: spacing.xs,
    },
    statusPanel: {
      marginBottom: theme.spacing[0],
    },
    participationModule: {
      gap: theme.spacing[3],
    },
    utilityActionsRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      alignSelf: 'stretch',
      alignItems: 'stretch',
    },
    utilityActionButton: {
      minHeight: theme.spacing[6] + theme.spacing[1],
      flex: 1,
      flexBasis: 0,
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
      paddingHorizontal: theme.spacing[2] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1],
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
      marginBottom: spacing.xs,
    },
    matchInfoMeta: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
    },
    matchInfoStatus: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    matchInfoVenue: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
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


