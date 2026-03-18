// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Text } from '../components/ui';
import { logger } from '../lib/logger';
import { fetchAttendees } from '../services/attendance';
import { defaultTheme as theme } from '../theme';
import { resolveAvatarUrl } from '../utils/avatar';

type EventAttendeesRouteProp = RouteProp<
  {
    EventAttendees:
      | { eventId: string; entityType?: 'event'; title?: string }
      | { entityId: string; entityType: 'event' | 'match'; title?: string };
  },
  'EventAttendees'
>;

interface Attendee {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function EventAttendeesScreen() {
  const navigation = useNavigation();
  const route = useRoute<EventAttendeesRouteProp>();
  const entityId = 'entityId' in route.params ? route.params.entityId : route.params.eventId;
  const entityType = route.params.entityType ?? 'event';
  const screenTitle = route.params.title ?? 'Deltagere';
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttendees = async () => {
    setLoading(true);
    setError(null);
    try {
      const attendeesList = await fetchAttendees({ entityType, entityId });
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
  }, [entityId, entityType]);

  const renderAttendee = ({ item }: { item: Attendee }) => (
    <View style={styles.attendeeItem}>
      <Avatar
        avatarUrl={resolveAvatarUrl(item.avatar_url)}
        size={theme.spacing[10]}
        label={item.display_name || 'Bruger'}
      />
      <Text variant="body" color="primary" style={styles.attendeeName}>
        {item.display_name || 'Bruger'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={theme.components.icon.size.md}
            color={theme.colors.bg.card}
          />
        </Pressable>
        <Text variant="h3" color="inverse" style={styles.headerTitle}>
          {screenTitle}
        </Text>
        <View style={{ flex: 1 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="body" color="secondary" style={styles.loadingText}>
            Henter deltagere...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="alert-circle-outline"
            size={theme.spacing[16]}
            color={theme.colors.error}
          />
          <Text variant="body" color="secondary" style={styles.emptyText}>
            {error}
          </Text>
        </View>
      ) : attendees.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="people-outline"
            size={theme.spacing[16]}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="secondary" style={styles.emptyText}>
            Ingen deltagere endnu
          </Text>
        </View>
      ) : (
        <FlatList
          data={attendees}
          keyExtractor={(item) => item.user_id}
          renderItem={renderAttendee}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
  },
  backButton: {
    padding: theme.spacing[1],
    marginRight: theme.spacing[2],
  },
  headerTitle: {
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.default,
    paddingHorizontal: theme.spacing[4],
  },
  loadingText: {
    marginTop: theme.spacing[3],
  },
  emptyText: {
    marginTop: theme.spacing[3],
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
  },
  attendeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  attendeeName: {
    fontWeight: '600',
  },
  separator: {
    height: theme.layout.borderHairline,
    backgroundColor: theme.colors.border.subtle,
    marginLeft: theme.spacing[10] + theme.spacing[3],
  },
});
