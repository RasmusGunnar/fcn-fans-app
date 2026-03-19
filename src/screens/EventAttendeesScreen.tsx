import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Card, Text } from '../components/ui';
import { fetchMatchCheckIns } from '../services/checkins';
import { logger } from '../lib/logger';
import type { EventAttendeesParams } from '../navigation/types';
import { fetchAttendees } from '../services/attendance';
import { useTheme } from '../theme';
import { resolveAvatarUrl } from '../utils/avatar';

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

  const entityId = 'entityId' in route.params ? route.params.entityId : route.params.eventId;
  const entityType = route.params.entityType ?? 'event';
  const mode = route.params.mode ?? 'attendance';
  const screenTitle = route.params.title ?? 'Deltagere';
  const summarySubtext =
    mode === 'checkin' ? 'Fans der er tjekket ind til kampen' : 'Fans der deltager i arrangementet';
  const attendeeSecondaryText =
    mode === 'checkin' ? 'Klar til kampdag' : 'Deltager i arrangementet';

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttendees = async () => {
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
  }, [entityId, entityType, mode]);

  const renderSummary = () => (
    <Card variant="raised" style={styles.summaryCard}>
      <Text variant="caption" color="secondary" style={styles.summaryEyebrow}>
        {mode === 'checkin' ? 'MATCHDAY' : 'DELTAGERE'}
      </Text>
      {!loading && !error ? (
        <View style={styles.summaryCountRow}>
          <Ionicons
            name={mode === 'checkin' ? 'checkmark-circle-outline' : 'people-outline'}
            size={theme.components.icon.size.sm}
            color={theme.colors.primary}
          />
          <Text variant="body" color="primary" style={styles.summaryCountText}>
            {formatAttendeeCount(attendees.length, mode)}
          </Text>
        </View>
      ) : null}
    </Card>
  );

  const renderAttendee = ({ item }: { item: Attendee }) => (
    <Card style={styles.attendeeCard}>
      <View style={styles.attendeeRow}>
        <Avatar
          avatarUrl={resolveAvatarUrl(item.avatar_url)}
          size={theme.spacing[11]}
          label={item.display_name || 'Bruger'}
        />
        <View style={styles.attendeeCopy}>
          <Text variant="bodyBold" color="primary" style={styles.attendeeName}>
            {item.display_name || 'Bruger'}
          </Text>
          <Text variant="caption" color="secondary" style={styles.attendeeMeta}>
            {attendeeSecondaryText}
          </Text>
        </View>
      </View>
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
        ) : attendees.length === 0 ? (
          <View style={styles.stateWrapper}>
            {renderSummary()}
            {renderStateCard(
              'people-outline',
              mode === 'checkin' ? 'Ingen fans er tjekket ind endnu' : 'Ingen deltagere endnu',
              mode === 'checkin'
                ? 'Når de første fans tjekker ind, vises de her.'
                : 'Når nogen deltager, vises de her.',
            )}
          </View>
        ) : (
          <FlatList
            data={attendees}
            keyExtractor={(item) => item.user_id}
            renderItem={renderAttendee}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={renderSummary}
            ItemSeparatorComponent={() => <View style={styles.listGap} />}
          />
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
    listGap: {
      height: theme.spacing[3],
    },
    attendeeCard: {
      marginBottom: theme.spacing[0],
    },
    attendeeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    attendeeCopy: {
      flex: 1,
      minWidth: 0,
    },
    attendeeName: {
      marginBottom: theme.spacing[1],
    },
    attendeeMeta: {
      fontWeight: '600',
    },
  });
