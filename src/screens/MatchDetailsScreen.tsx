import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  MatchdayStatusPanel,
  type MatchdaySimpleParticipationMode,
} from '../components/match/MatchdayStatusPanel';
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
import { navigateToStadiumLive } from '../navigation/navigationRef';
import { useMatchdayState } from '../state/MatchdayStateContext';
import { spacing, useTheme } from '../theme';
import { buildMatchMapsUrl, FCN_TICKET_URL, isFcnHomeMatch } from '../utils/matchLinks';
import { buildMatchdayUiModel } from '../utils/matchdayUiModel';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
const MATCH_CHECKIN_FANPOINTS = 5;

function formatCountdownLabel(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart 🔥';
  if (diffHours < 48) return `Starter om ${Math.ceil(diffHours)} timer`;
  return `Starter om ${Math.ceil(diffHours / 24)} dage`;
}

function buildCheckInSocialProof(checkedInCount: number): {
  countLabel?: string | null;
  text: string;
} {
  if (checkedInCount <= 0) {
    return {
      countLabel: null,
      text: 'Ingen er på stadion endnu',
    };
  }

  return {
    countLabel: null,
    text:
      checkedInCount === 1
        ? '1 er på stadion'
        : `${checkedInCount.toLocaleString('da-DK')} er på stadion`,
  };
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
  const heroPulse = useRef(new Animated.Value(1)).current;
  const checkInPulse = useRef(new Animated.Value(0)).current;
  const autoOpenedFanActivityIdRef = useRef<string | null>(null);
  const matchdayState = useMatchdayState(fixtureId);
  const refreshMatchdayState = matchdayState.refresh;

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
    if (!matchdayState.isCheckedIn) return;

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
  }, [checkInPulse, matchdayState.isCheckedIn]);

  const matchdayUiModel = useMemo(() => {
    if (!fixture?.kickoff_at) {
      return null;
    }

    return buildMatchdayUiModel({
      kickoffAt: fixture.kickoff_at,
      now,
      stadiumLiveOpen: matchdayState.stadiumLiveOpen,
      attendance: {
        isGoing: matchdayState.rsvpStatus === 'going',
        countGoing: matchdayState.attendanceCount,
        avatars: matchdayState.attendanceAvatars,
      },
      checkIn: {
        isCheckedIn: matchdayState.isCheckedIn,
        countCheckedIn: matchdayState.participantCount,
        avatars: matchdayState.participantAvatars,
      },
      participationChoice:
        matchdayState.rsvpStatus === 'going'
          ? 'going'
          : matchdayState.rsvpStatus === 'not_going'
            ? 'not_going'
            : null,
    });
  }, [
    fixture?.kickoff_at,
    matchdayState.attendanceAvatars,
    matchdayState.attendanceCount,
    matchdayState.isCheckedIn,
    matchdayState.participantAvatars,
    matchdayState.participantCount,
    matchdayState.rsvpStatus,
    matchdayState.stadiumLiveOpen,
    now,
  ]);
  const effectiveIsMatchday = matchdayUiModel?.timing.isMatchday ?? false;
  const participationUiMode = useMemo<MatchdaySimpleParticipationMode>(() => {
    if (!effectiveIsMatchday) {
      return 'rsvp';
    }

    if (matchdayUiModel?.effectiveIsCheckedIn) {
      return 'checked_in';
    }
    return 'check_in';
  }, [effectiveIsMatchday, matchdayUiModel?.effectiveIsCheckedIn]);
  const matchdayPanelText = useMemo(() => {
    if (!effectiveIsMatchday) {
      return {
        title: undefined,
        body: undefined,
      };
    }

    if (matchdayUiModel?.effectiveIsCheckedIn) {
      return {
        title: 'Du er tjekket ind',
        body:
          matchdayUiModel.previewMode === 'off'
            ? `Du deltager i Stadion Live og er synlig for andre checkede-in fans.\n+${MATCH_CHECKIN_FANPOINTS} fanpoint`
            : 'Du deltager i Stadion Live og er synlig for andre checkede-in fans.',
      };
    }

    if (matchdayUiModel?.effectiveIsGoing) {
      return {
        title: 'Du har sagt, at du kommer – klar til at tjekke ind?',
        body: 'Tjek ind på stadion for at deltage i Stadion Live.',
      };
    }

    return {
      title: 'Er du på stadion i dag?',
      body: 'Tjek ind og vis, at du er med.',
    };
  }, [
    effectiveIsMatchday,
    matchdayUiModel?.effectiveIsCheckedIn,
    matchdayUiModel?.effectiveIsGoing,
    matchdayUiModel?.previewMode,
  ]);
  const matchdayRewardLabel =
    effectiveIsMatchday &&
    matchdayUiModel?.effectiveIsCheckedIn &&
    matchdayUiModel.previewMode === 'off'
      ? `+${MATCH_CHECKIN_FANPOINTS} fanpoint`
      : undefined;
  const matchdaySocialProofOverride = useMemo(() => {
    if (!effectiveIsMatchday) {
      return undefined;
    }

    return buildCheckInSocialProof(matchdayState.participantCount);
  }, [effectiveIsMatchday, matchdayState.participantCount]);
  const handleDeleteFanActivity = useCallback(
    (fanActivityId: string) => {
      setFanActivities((current) => current.filter((activity) => activity.id !== fanActivityId));
      setSelectedFanActivity((current) => (current?.id === fanActivityId ? null : current));
      void loadFanActivities();
    },
    [loadFanActivities],
  );

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
  const resolvedMatchdayUiModel = matchdayUiModel!;
  const matchViewState = resolvedMatchdayUiModel.viewState;
  const isGoingToMatch = resolvedMatchdayUiModel.effectiveIsGoing;
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

  const handleSelectParticipation = async (choice: 'going' | 'not_going') => {
    await matchdayState.setRsvpStatus(choice);
  };

  const handleCheckIn = async () => {
    try {
      await matchdayState.checkIn();
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
    const usesAttendanceSocial = resolvedMatchdayUiModel.socialSource === 'attendance';
    const panelCount = resolvedMatchdayUiModel.socialCount;
    const panelAvatars = resolvedMatchdayUiModel.socialAvatars;
    const panelSecondarySelected = usesAttendanceSocial && matchdayState.rsvpStatus === 'not_going';
    const panelPrimaryLabel =
      participationUiMode === 'checked_in' || participationUiMode === 'not_going_matchday'
        ? undefined
        : participationUiMode === 'check_in'
          ? matchdayState.loading
            ? 'Tjekker ind...'
            : resolvedMatchdayUiModel.effectiveIsGoing
              ? 'Check ind på stadion'
              : 'Check ind'
          : panelSecondarySelected
            ? 'Jeg kommer'
            : isGoingToMatch
              ? 'Du kommer'
              : 'Jeg kommer';
    const panelPrimaryDisabled =
      participationUiMode === 'checked_in'
        ? true
        : participationUiMode === 'check_in'
          ? matchdayState.loading || !matchdayState.canCheckIn
          : matchdayState.loading;
    const panelSecondaryLabel =
      participationUiMode === 'rsvp' && usesAttendanceSocial ? 'Kan ikke komme' : undefined;
    const panelSecondaryDisabled =
      participationUiMode === 'rsvp' && usesAttendanceSocial ? matchdayState.loading : true;
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
        simpleParticipationModeType={participationUiMode}
        titleOverride={matchdayPanelText.title}
        bodyOverride={
          participationUiMode === 'checked_in'
            ? 'Du deltager i Stadion Live og er synlig for andre checkede-in fans.'
            : matchdayPanelText.body
        }
        socialCopyOverride={matchdaySocialProofOverride}
        rewardLabelOverride={matchdayRewardLabel}
        onPressPrimary={
          participationUiMode === 'check_in'
            ? handleCheckIn
            : () => handleSelectParticipation('going')
        }
        onPressSecondary={
          usesAttendanceSocial ? () => handleSelectParticipation('not_going') : undefined
        }
        onPressSocial={handleOpenMatchFans}
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
        {matchdayState.error ? (
          <Text style={styles.statusPanelError}>{matchdayState.error}</Text>
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
                  style={[styles.h2hLogoImg, styles.h2hLogoImgHome]}
                  resizeMode="contain"
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
                  style={[styles.h2hLogoImg, styles.h2hLogoImgAway]}
                  resizeMode="contain"
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
        </View>

        <View style={styles.contentBlock}>
          <View style={styles.topExperienceShell}>
            <View style={styles.matchInfoBlock}>
              <Text style={styles.matchInfoEyebrow}>Næste kamp</Text>
              <Text style={styles.matchInfoTitle}>
                {fixture.home_team} vs {fixture.away_team}
              </Text>

              <View style={styles.matchInfoDetails}>
                <View style={styles.matchInfoIconBlock}>
                  <Ionicons
                    name="calendar-outline"
                    size={theme.components.icon.size.md}
                    color={theme.colors.primary}
                  />
                </View>

                <View style={styles.matchInfoContent}>
                  <Text style={styles.matchInfoMeta}>{formatDateDa(fixture.kickoff_at)}</Text>
                  {matchLocationLabel ? (
                    <Text style={styles.matchInfoVenue}>{matchLocationLabel}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.participationModule}>
              {renderStatusPanel()}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Åbn Stadion Live"
                onPress={handleOpenMatchFans}
                style={({ pressed }) => [
                  styles.stadiumLiveAction,
                  pressed ? styles.utilityActionPressed : null,
                ]}
              >
                <View style={styles.stadiumLiveActionIcon}>
                  <Ionicons name="radio-outline" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.stadiumLiveActionCopy}>
                  <Text style={styles.stadiumLiveActionTitle}>På stadion</Text>
                  <Text style={styles.stadiumLiveActionBody}>
                    {matchdayState.isCheckedIn
                      ? `Se ${matchdayState.participantCount} fans på stadion`
                      : 'Check ind for at se de andre fans'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
              </Pressable>

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
                composerPlaceholder="Skriv om stemningen før kamp..."
                quickActionMode="prefill"
                replyModeLabel="Svar"
                quickActionChips={['Mit bud: FCN vinder ...', 'Hvem mødes før kamp?']}
              />
            </Card>
          </View>
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
      height: theme.spacing[16] + theme.spacing[16] + theme.spacing[10] + theme.spacing[2],
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
    heroTopRow: {
      position: 'absolute',
      top: theme.spacing[5],
      left: spacing.md,
      right: spacing.md,
      zIndex: 3,
    },
    heroChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    matchStatusChip: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
    },
    matchStatusChipText: {
      color: theme.colors.text.inverse,
      fontWeight: '600',
      fontSize: theme.typography.caption.fontSize - 1,
      opacity: 0.82,
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    h2hOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: theme.spacing[10],
      bottom: theme.spacing[12],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      zIndex: 2,
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
    h2hLogoImgHome: {
      width: theme.spacing[16] + theme.spacing[10],
      height: theme.spacing[16] + theme.spacing[10],
    },
    h2hLogoImgAway: {
      width: theme.spacing[16] + theme.spacing[8],
      height: theme.spacing[16] + theme.spacing[8],
    },
    h2hVsText: {
      fontSize: Math.round(theme.typography.h2.fontSize * 1.16),
      fontWeight: '800',
      letterSpacing: 1,
      opacity: 0.92,
      paddingHorizontal: theme.spacing[1],
      paddingVertical: theme.spacing[1] / 2,
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    countdownWrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: theme.spacing[7],
      alignItems: 'center',
      zIndex: 3,
    },
    countdownText: {
      color: theme.colors.text.primary,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
    },
    contentBlock: {
      paddingHorizontal: spacing.md,
      paddingTop: theme.spacing[1],
      gap: spacing.md,
    },
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
