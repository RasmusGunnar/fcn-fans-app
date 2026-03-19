import React, { useEffect, useRef, useState } from 'react';
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
import { MatchdayStatusPanel } from '../components/match/MatchdayStatusPanel';
import { AttendanceBubbles } from '../components/social/AttendanceBubbles';
import { PrimaryButton } from '../components/PrimaryButton';
import { OutlineButton } from '../components/ui/OutlineButton';
import { Card } from '../components/ui/Card';
import type { RootStackParamList } from '../navigation/types';
import { fetchFixtureById, type Fixture } from '../services/eventsApi';
import { formatDateDa } from '../services/fixtures';
import { getMatchHeroUrl, getTeamHeroImage } from '../services/sportsdb';
import { useAttendance } from '../hooks/useAttendance';
import { useMatchCheckIn } from '../hooks/useMatchCheckIn';
import { spacing, useTheme } from '../theme';
import { buildMatchMapsUrl, FCN_TICKET_URL, isFcnHomeMatch } from '../utils/matchLinks';
import { getMatchdayTiming, getMatchViewState } from '../utils/matchdayState';
import { applyMatchdayPreview } from '../utils/matchdayPreview';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
type MatchParticipationChoice = 'going' | 'tv' | 'not_going' | null;

function formatCountdownLabel(kickoffAt: string, now: Date): string {
  const diffMs = new Date(kickoffAt).getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'Kampen er i gang';
  if (diffHours < 2) return 'Starter snart \uD83D\uDD25';
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

function MatchActivityRow({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();
  const styles = stylesFactory(theme);

  return (
    <Pressable style={styles.activityRow}>
      <View style={styles.activityIconWrap}>
        <Ionicons name={icon} size={theme.components.icon.size.sm} color={theme.colors.primary} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activitySubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.activityCtaWrap}>
        <Text style={styles.activityCtaText}>Se mere</Text>
        <Ionicons
          name="chevron-forward"
          size={theme.components.icon.size.sm}
          color={theme.colors.text.secondary}
        />
      </View>
    </Pressable>
  );
}

export default function MatchDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { fixtureId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user, isAppAdmin } = useAuth();
  const theme = useTheme();
  const styles = stylesFactory(theme);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [participationChoice, setParticipationChoice] = useState<MatchParticipationChoice>(null);
  const heroPulse = useRef(new Animated.Value(1)).current;
  const checkInPulse = useRef(new Animated.Value(0)).current;
  const attendance = useAttendance({ entityType: 'match', entityId: fixtureId });
  const matchCheckIn = useMatchCheckIn(fixtureId, fixture?.kickoff_at ?? null);

  useEffect(() => {
    if (fixtureId) {
      loadFixture();
    }
  }, [fixtureId]);

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
      if (!hero && data.home_team_provider_id) {
        hero = await getTeamHeroImage(data.home_team_provider_id);
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
          <PrimaryButton title="G\u00e5 tilbage" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const isHomeMatch = isFcnHomeMatch(fixture);
  const mapsUrl = buildMatchMapsUrl(fixture);
  const isGoingToMatch = participationChoice === 'going' || attendance.isGoing || matchCheckIn.isCheckedIn;
  const competitionLabel = [fixture.competition, fixture.round].filter(Boolean).join(' \u00b7 ');
  const countdownLabel = formatCountdownLabel(fixture.kickoff_at, now);
  const liveMatchdayState = getMatchdayTiming(fixture.kickoff_at, now);
  const matchdayState = applyMatchdayPreview(liveMatchdayState);
  const matchViewState = getMatchViewState({
    isMatchday: matchdayState.isMatchday,
    isGoing: isGoingToMatch,
    isCheckedIn: matchCheckIn.isCheckedIn,
  });
  const handleOpenRoute = async () => {
    if (!mapsUrl) return;
    try {
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('[MatchDetails] Route open error:', error);
      Alert.alert('Fejl', 'Kunne ikke \u00e5bne kortet.');
    }
  };

  const handleOpenTickets = async () => {
    try {
      await Linking.openURL(FCN_TICKET_URL);
    } catch (error) {
      console.error('[MatchDetails] Ticket open error:', error);
      Alert.alert('Fejl', 'Kunne ikke \u00e5bne billetsiden.');
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
      title: 'Tjekket ind p\u00e5 stadion',
      mode: 'checkin',
    });
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
      Alert.alert('Fejl', 'Kunne ikke gennemf\u00f8re check-in.');
    }
  };

  const renderParticipationCard = () => {
    if (isGoingToMatch) {
      return null;
    }

    return (
      <Card style={styles.stateCard}>
        {participationChoice === 'tv' ? (
          <>
            <Text style={styles.stateCardEyebrow}>DIN STATUS</Text>
            <Text style={styles.stateCardTitle}>Ser den p\u00e5 TV</Text>
            <Text style={styles.stateCardBody}>
              Fans ser kampen hjemme, men du har stadig fuld adgang til Kampsnak.
            </Text>
            <View style={styles.stateSecondaryActions}>
              <View style={styles.stateSecondaryAction}>
                <OutlineButton
                  title="Forhindret"
                  onPress={() => handleSelectParticipation('not_going')}
                />
              </View>
            </View>
          </>
        ) : participationChoice === 'not_going' ? (
          <>
            <Text style={styles.stateCardEyebrow}>DIN STATUS</Text>
            <Text style={styles.stateCardTitle}>Forhindret</Text>
            <Text style={styles.stateCardBody}>
              Du kan ikke komme, men du kan stadig v\u00e6re med i samtalen f\u00f8r kampstart.
            </Text>
            <View style={styles.stateSecondaryActions}>
              <View style={styles.stateSecondaryAction}>
                <OutlineButton title="Ser den p\u00e5 TV" onPress={() => handleSelectParticipation('tv')} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.stateCardEyebrow}>ANDRE MULIGHEDER</Text>
            <Text style={styles.stateCardTitle}>Hvis du ikke kommer</Text>
            <Text style={styles.stateCardBody}>
              V\u00e6lg en anden m\u00e5de at f\u00f8lge kampen p\u00e5. Du kan stadig \u00e6ndre mening og bruge
              panelet ovenfor, hvis du vil med.
            </Text>
            <View style={styles.stateSecondaryActions}>
              <View style={styles.stateSecondaryAction}>
                <OutlineButton title="Ser den p\u00e5 TV" onPress={() => handleSelectParticipation('tv')} />
              </View>
              <View style={styles.stateSecondaryAction}>
                <OutlineButton
                  title="Forhindret"
                  onPress={() => handleSelectParticipation('not_going')}
                />
              </View>
            </View>
          </>
        )}
      </Card>
    );
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
    const panelCount =
      matchViewState === 'pre_match' ? attendance.countGoing : matchCheckIn.countCheckedIn;
    const panelAvatars =
      matchViewState === 'pre_match' ? attendance.avatars : matchCheckIn.avatars;
    const panelPrimaryLabel =
      matchViewState === 'checked_in_confirmed'
        ? undefined
        : matchViewState === 'matchday_action'
          ? matchCheckIn.loading
            ? 'Tjekker ind...'
            : 'Tjek ind'
          : isGoingToMatch
            ? 'Du kommer'
            : 'Jeg kommer';
    const panelPrimaryDisabled =
      matchViewState === 'checked_in_confirmed'
        ? true
        : matchViewState === 'matchday_action'
          ? matchCheckIn.loading
          : isGoingToMatch || attendance.loading;
    const panel = (
      <MatchdayStatusPanel
        viewState={matchViewState}
        isGoing={isGoingToMatch}
        avatars={panelAvatars}
        count={panelCount}
        primaryLabel={panelPrimaryLabel}
        primaryDisabled={panelPrimaryDisabled}
        onPressPrimary={
          matchViewState === 'matchday_action'
            ? handleCheckIn
            : () => handleSelectParticipation('going')
        }
        onPressSocial={
          matchViewState === 'pre_match' ? handleOpenAttendees : handleOpenCheckedInFans
        }
        secondaryActions={[
          {
            label: 'K\u00f8b billet',
            icon: 'ticket-outline',
            onPress: handleOpenTickets,
            disabled: !isHomeMatch,
          },
          {
            label: 'Vejvisning',
            icon: 'navigate-outline',
            onPress: handleOpenRoute,
            disabled: !mapsUrl,
          },
        ]}
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
            <Text style={styles.matchInfoEyebrow}>N\u00e6ste kamp</Text>
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
                    {fixture.venue_city ? ` \u00b7 ${fixture.venue_city}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.matchInfoMeta}>{formatDateDa(fixture.kickoff_at)}</Text>
                <Text style={styles.matchInfoStatus}>
                  {isGoingToMatch ? 'Du kommer til kampen' : 'V\u00e6lg hvordan du f\u00f8lger kampen'}
                </Text>
              </View>
            </View>
          </Card>

          {renderStatusPanel()}
          {renderParticipationCard()}

          {matchViewState === 'pre_match' ? (
            <Pressable style={styles.communityStrip} onPress={handleOpenAttendees}>
              <View style={styles.communityStripLead}>
                <AttendanceBubbles
                  avatars={attendance.avatars}
                  count={attendance.countGoing}
                  max={5}
                  size={22}
                  textVariant="caption"
                  showCountText={false}
                />
                <View style={styles.communityStripCopy}>
                  <Text style={styles.communityStripTitle}>
                    {attendance.countGoing.toLocaleString('da-DK')} {attendance.countGoing === 1 ? 'fan kommer' : 'fans kommer'}
                  </Text>
                  <Text style={styles.communityStripMeta}>Se alle deltagere</Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.secondary}
              />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>FANAKTIVITETER</Text>
            <Card style={styles.activitiesCard}>
              <MatchActivityRow
                icon="bus-outline"
                title="Bustur til kampen"
                subtitle="Koordin\u00e9r transport og m\u00f8detid med de andre fans"
              />
              <View style={styles.activityDivider} />
              <MatchActivityRow
                icon="restaurant-outline"
                title="F\u00e6lles optakt"
                subtitle="Planl\u00e6g m\u00f8dested og f\u00e5 gang i stemningen f\u00f8r kickoff"
              />
            </Card>
          </View>

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
                composerPlaceholder="Del stemningen f\u00f8r kamp..."
                quickActionMode="submit"
                quickActionFeedbackForValue={(value) =>
                  value === 'Jeg er p\u00e5 vej' ? 'Du er p\u00e5 vej \uD83D\uDD34' : 'Du deltager i snakken'
                }
                replyModeLabel="Svar"
                quickActionChips={[
                  'Jeg er p\u00e5 vej',
                  'M\u00f8des f\u00f8r kamp?',
                  'Hvem er p\u00e5 stadion?',
                  'Mit bud p\u00e5 kampen',
                ]}
              />
            </Card>
          </View>
        </View>
      </ScrollView>
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
    choiceCard: {
      marginBottom: theme.spacing[0],
    },
    stateCard: {
      marginBottom: theme.spacing[0],
    },
    stateCardEyebrow: {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      color: theme.colors.text.secondary,
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    stateCardTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: spacing.sm,
    },
    choiceButtonGroup: {
      gap: spacing.sm,
    },
    stateCardBody: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      lineHeight: theme.spacing[4],
      marginBottom: spacing.sm,
    },
    stateSecondaryActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    stateSecondaryAction: {
      flex: 1,
    },
    statusPanelWrap: {
      gap: spacing.xs,
    },
    statusPanel: {
      marginBottom: theme.spacing[0],
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
    communityStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    communityStripLead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    communityStripCopy: {
      flex: 1,
    },
    communityStripTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[0],
    },
    communityStripMeta: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      fontWeight: '600',
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
    activitiesCard: {
      marginBottom: theme.spacing[0],
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    activityIconWrap: {
      width: theme.spacing[9],
      height: theme.spacing[9],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityContent: {
      flex: 1,
    },
    activityTitle: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[0],
    },
    activitySubtitle: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      lineHeight: theme.spacing[3],
    },
    activityCtaWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    activityCtaText: {
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    activityDivider: {
      height: theme.layout.borderHairline,
      backgroundColor: theme.colors.border.subtle,
      marginVertical: spacing.xs,
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


