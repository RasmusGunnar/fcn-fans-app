import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { MatchFanList, type MatchFanListItem } from '../components/match/MatchFanList';
import { Card, Text } from '../components/ui';
import { fetchMatchCheckIns } from '../services/checkins';
import { createMatchHighfive, fetchSentMatchHighfives } from '../services/matchHighfives';
import { logger } from '../lib/logger';
import type { EventAttendeesParams } from '../navigation/types';
import { fetchAttendees } from '../services/attendance';
import { useTheme } from '../theme';

type EventAttendeesRouteProp = RouteProp<
  {
    EventAttendees: EventAttendeesParams;
  },
  'EventAttendees'
>;

interface Attendee {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

function formatAttendeeCount(count: number, mode: 'attendance' | 'checkin'): string {
  const noun = count === 1 ? 'fan' : 'fans';
  return mode === 'checkin' ? `${count} ${noun} tjekket ind` : `${count} ${noun} deltager`;
}

export default function EventAttendeesScreen() {
  const navigation = useNavigation();
  const route = useRoute<EventAttendeesRouteProp>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();

  const entityId = 'entityId' in route.params ? route.params.entityId : route.params.eventId;
  const entityType = route.params.entityType ?? 'event';
  const mode = route.params.mode ?? 'attendance';
  const prefilledFans = route.params.prefilledFans;
  const isCombinedMatchFans = entityType === 'match' && Array.isArray(prefilledFans);
  const screenTitle =
    route.params.title ??
    (isCombinedMatchFans
      ? 'Fans til kampen'
      : mode === 'checkin'
        ? 'Fans der er tjekket ind til kampen'
        : 'Deltagere');
  const summarySubtext =
    route.params.subtitle ??
    (isCombinedMatchFans
      ? 'Se hvem der kommer, og hvem der er tjekket ind'
      : mode === 'checkin'
        ? 'Fans der er tjekket ind til kampen'
        : 'Fans der deltager i arrangementet');

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(!isCombinedMatchFans);
  const [error, setError] = useState<string | null>(null);
  const [highfivedUserIds, setHighfivedUserIds] = useState<Set<string>>(() => new Set());
  const [pendingHighfiveUserIds, setPendingHighfiveUserIds] = useState<Set<string>>(() => new Set());

  const loadAttendees = async () => {
    if (isCombinedMatchFans) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const attendeesList =
        mode === 'checkin' && entityType === 'match'
          ? await fetchMatchCheckIns(entityId)
          : await fetchAttendees({ entityType, entityId });
      setAttendees(attendeesList);
    } catch (loadError: any) {
      logger.error('Error loading attendees:', loadError);
      setError(loadError?.message || 'Kunne ikke hente deltagere');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, entityType, mode, isCombinedMatchFans]);

  const attendeeItems = useMemo<MatchFanListItem[]>(
    () =>
      attendees.map((attendee) => ({
        userId: attendee.user_id,
        displayName: attendee.display_name,
        avatarUrl: attendee.avatar_url,
        status: mode === 'checkin' ? 'checked_in' : 'going',
      })),
    [attendees, mode],
  );
  const displayItems = useMemo<MatchFanListItem[]>(
    () =>
      isCombinedMatchFans
        ? (prefilledFans ?? []).map((fan) => ({
            userId: fan.userId,
            displayName: fan.displayName,
            avatarUrl: fan.avatarUrl,
            status: fan.status === 'checkin' ? 'checked_in' : 'going',
          }))
        : attendeeItems,
    [attendeeItems, isCombinedMatchFans, prefilledFans],
  );
  const totalCount = displayItems.length;
  const checkedInUserIds = useMemo(
    () => displayItems.filter((item) => item.status === 'checked_in').map((item) => item.userId),
    [displayItems],
  );
  const currentUserIsCheckedIn = !!(user?.id && checkedInUserIds.includes(user.id));
  const highfiveActionsEnabled = entityType === 'match' && currentUserIsCheckedIn;

  useEffect(() => {
    let mounted = true;

    const loadHighfives = async () => {
      if (!highfiveActionsEnabled || !user?.id) {
        setHighfivedUserIds(new Set());
        setPendingHighfiveUserIds(new Set());
        return;
      }

      try {
        const sentHighfives = await fetchSentMatchHighfives({
          matchId: entityId,
          fromUserId: user.id,
          toUserIds: checkedInUserIds,
        });

        if (mounted) {
          setHighfivedUserIds(new Set(sentHighfives));
        }
      } catch (loadError) {
        logger.error('Error loading match highfives:', loadError);
      }
    };

    loadHighfives();

    return () => {
      mounted = false;
    };
  }, [checkedInUserIds, entityId, highfiveActionsEnabled, user?.id]);

  const handleHighfive = useCallback(
    async (toUserId: string) => {
      if (!highfiveActionsEnabled || !user?.id) return;
      if (toUserId === user.id) return;
      if (!checkedInUserIds.includes(toUserId)) return;
      if (highfivedUserIds.has(toUserId) || pendingHighfiveUserIds.has(toUserId)) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

      setHighfivedUserIds((current) => {
        const next = new Set(current);
        next.add(toUserId);
        return next;
      });
      setPendingHighfiveUserIds((current) => {
        const next = new Set(current);
        next.add(toUserId);
        return next;
      });

      try {
        await createMatchHighfive({
          matchId: entityId,
          fromUserId: user.id,
          toUserId,
        });
      } catch (highfiveError: any) {
        logger.error('Error creating match highfive:', highfiveError);
        setHighfivedUserIds((current) => {
          const next = new Set(current);
          next.delete(toUserId);
          return next;
        });
        Alert.alert('Fejl', highfiveError?.message || 'Kunne ikke sende highfive.');
      } finally {
        setPendingHighfiveUserIds((current) => {
          const next = new Set(current);
          next.delete(toUserId);
          return next;
        });
      }
    },
    [
      checkedInUserIds,
      entityId,
      highfiveActionsEnabled,
      highfivedUserIds,
      pendingHighfiveUserIds,
      user?.id,
    ],
  );

  const renderSummary = () => (
    <Card variant="raised" style={styles.summaryCard}>
      <Text variant="caption" color="secondary" style={styles.summaryEyebrow}>
        {isCombinedMatchFans ? 'FANS' : mode === 'checkin' ? 'MATCHDAY' : 'DELTAGERE'}
      </Text>
      {!loading && !error ? (
        <View style={styles.summaryCountRow}>
          <Ionicons
            name={isCombinedMatchFans || mode !== 'checkin' ? 'people-outline' : 'checkmark-circle-outline'}
            size={theme.components.icon.size.sm}
            color={theme.colors.primary}
          />
          <Text variant="body" color="primary" style={styles.summaryCountText}>
            {isCombinedMatchFans
              ? `${totalCount} ${totalCount === 1 ? 'fan' : 'fans'} til kampen`
              : formatAttendeeCount(attendees.length, mode)}
          </Text>
        </View>
      ) : null}
    </Card>
  );

  const renderStateCard = (icon: keyof typeof Ionicons.glyphMap, title: string, body?: string) => (
    <Card style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        <Ionicons name={icon} size={theme.components.icon.size.lg} color={theme.colors.primary} />
      </View>
      <Text variant="bodyBold" color="primary" style={styles.stateTitle}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="secondary" style={styles.stateBody}>
          {body}
        </Text>
      ) : null}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={theme.components.icon.size.md}
            color={theme.colors.text.inverse}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text variant="h3" color="inverse" style={styles.headerTitle}>
            {screenTitle}
          </Text>
          <Text variant="caption" color="inverse" style={styles.headerSubtitle}>
            {summarySubtext}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.stateWrapper}>
            {renderSummary()}
            {renderStateCard('refresh-outline', 'Henter deltagere...', 'Vent et øjeblik')}
          </View>
        ) : error ? (
          <View style={styles.stateWrapper}>
            {renderSummary()}
            {renderStateCard('alert-circle-outline', error, 'Prøv igen om et øjeblik')}
          </View>
        ) : displayItems.length === 0 ? (
          <View style={styles.stateWrapper}>
            {renderSummary()}
            {renderStateCard(
              'people-outline',
              isCombinedMatchFans
                ? 'Ingen fans til kampen endnu'
                : mode === 'checkin'
                  ? 'Ingen fans er tjekket ind endnu'
                  : 'Ingen deltagere endnu',
              isCombinedMatchFans
                ? 'Når nogen melder sig til eller tjekker ind, vises de her.'
                : mode === 'checkin'
                ? 'Når de første fans tjekker ind, vises de her.'
                : 'Når nogen deltager, vises de her.',
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {renderSummary()}
            <MatchFanList
              items={displayItems}
              variant="full"
              style={styles.attendeeList}
              highfiveEnabled={highfiveActionsEnabled}
              currentUserId={user?.id}
              highfivedUserIds={highfivedUserIds}
              pendingHighfiveUserIds={pendingHighfiveUserIds}
              onHighfive={handleHighfive}
            />
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[4],
      backgroundColor: theme.colors.primary,
    },
    backButton: {
      padding: theme.spacing[1],
      marginRight: theme.spacing[2],
      marginTop: theme.spacing[0],
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    headerTitle: {
      fontWeight: '700',
      marginBottom: theme.spacing[1],
    },
    headerSubtitle: {
      opacity: 0.86,
      lineHeight: theme.spacing[4],
    },
    body: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    stateWrapper: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[4],
      gap: theme.spacing[3],
    },
    summaryCard: {
      marginBottom: theme.spacing[0],
    },
    summaryEyebrow: {
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: theme.spacing[1],
    },
    summaryCountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    summaryCountText: {
      fontWeight: '700',
    },
    stateCard: {
      alignItems: 'center',
      paddingVertical: theme.spacing[6],
    },
    stateIconWrap: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing[3],
    },
    stateTitle: {
      textAlign: 'center',
      marginBottom: theme.spacing[2],
    },
    stateBody: {
      textAlign: 'center',
      lineHeight: theme.spacing[4],
    },
    listContent: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[5],
    },
    attendeeList: {
      marginTop: theme.spacing[3],
    },
  });
