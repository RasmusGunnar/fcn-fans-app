// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { OptionsMenu, OptionsMenuOption } from '../components/OptionsMenu';
import { InlineComments } from '../components/comments/InlineComments';
import { FanActivityDetailSheet } from '../components/fan/FanActivityDetailSheet';
import { FanActivitiesShowcase } from '../components/fan/FanActivitiesShowcase';
import { AttendanceBubbles } from '../components/social/AttendanceBubbles';
import { Text } from '../components/ui';
import { Card } from '../components/ui/Card';
import { EventSubtypeBadge } from '../components/ui/EventSubtypeBadge';
import { useAttendance } from '../hooks/useAttendance';
import { useCommunityRole } from '../hooks/useCommunityRole';
import { logger } from '../lib/logger';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import type { EventDetailsParams } from '../navigation/types';
import { fetchEventById, type Event } from '../services/eventsApi';
import { fetchFanActivitiesForEvent, type FanActivity } from '../services/fanActivities';
import { defaultTheme as theme } from '../theme';
import { canDeleteEvent, canEditEvent } from '../utils/permissions';

type EventDetailsRouteProp = RouteProp<{ EventDetails: EventDetailsParams }, 'EventDetails'>;

function formatDateDa(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildAddressDisplay(event: Event): string | null {
  const parts: string[] = [];
  if (event.address_line1) parts.push(event.address_line1);
  if (event.postal_code || event.city) {
    parts.push([event.postal_code, event.city].filter(Boolean).join(' '));
  }
  if (parts.length > 0) return parts.join(', ');
  return event.location_address || null;
}

function getCoverUrl(event: Event): string | null {
  if (event.cover_bucket && event.cover_path) {
    return getPublicUrl(event.cover_bucket, event.cover_path);
  }
  return null;
}

function buildMapsDestination(event: Event): string | null {
  const street = event.address_line1?.trim();
  const postal = event.postal_code?.trim();
  const city = event.city?.trim();
  const clearAddress = [street, [postal, city].filter(Boolean).join(' ').trim()]
    .filter(Boolean)
    .join(', ')
    .trim();

  if (clearAddress) return clearAddress;
  return event.location_address?.trim() || null;
}

function buildMapsUrl(event: Event): string | null {
  if (event.lat != null && event.lng != null) {
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${event.lat},${event.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`;
  }

  const destination = buildMapsDestination(event);
  if (!destination) return null;

  const encoded = encodeURIComponent(destination);
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function formatAttendeeCount(count: number): string {
  if (count === 1) return '1 deltager';
  return `${count} deltagere`;
}

export default function EventDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<EventDetailsRouteProp>();
  const { eventId, fanActivityId } = route.params;
  const requestedFanActivityId = fanActivityId?.trim() || null;
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(null);
  const [fanActivities, setFanActivities] = useState<FanActivity[]>([]);
  const [selectedFanActivity, setSelectedFanActivity] = useState<FanActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const autoOpenedFanActivityIdRef = useRef<string | null>(null);
  const { user, isAppAdmin } = useAuth();

  const { role: communityRole } = useCommunityRole(event?.organizer_group_id);
  const attendance = useAttendance({ entityType: 'event', entityId: eventId });

  const loadEvent = useCallback(async () => {
    setLoading(true);
    const data = await fetchEventById(eventId);
    setEvent(data);
    setLoading(false);
  }, [eventId]);

  const loadFanActivities = useCallback(async () => {
    const data = await fetchFanActivitiesForEvent(eventId);
    setFanActivities(data);
  }, [eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    setFanActivities([]);
    void loadFanActivities();
  }, [loadFanActivities]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (event) loadEvent();
    });
    return unsubscribe;
  }, [navigation, loadEvent, event]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void loadFanActivities();
    });

    return unsubscribe;
  }, [loadFanActivities, navigation]);

  useEffect(() => {
    autoOpenedFanActivityIdRef.current = null;
  }, [eventId, requestedFanActivityId]);

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

  const handleShare = async () => {
    if (!event) return;
    try {
      await Share.share({
        message: `${event.title}\n${event.description || ''}\n${formatDateDa(event.start_at)}`,
        title: event.title,
      });
    } catch (error) {
      logger.error('[EventDetails] Error sharing:', error);
    }
  };

  const handleFindvej = async () => {
    if (!event) return;
    try {
      const url = buildMapsUrl(event);
      if (url) {
        await Linking.openURL(url);
      }
    } catch (error) {
      logger.error('[EventDetails] Error opening maps:', error);
    }
  };

  const handleEditEvent = () => {
    (navigation as any).navigate('EditEvent', { eventId });
  };

  const handleCreateFanActivity = () => {
    if (!event?.organizer_group_id) return;

    (navigation as any).navigate('CreateFanActivity', {
      parentType: 'event',
      parentId: eventId,
      communityId: event.organizer_group_id,
      lockCommunity: true,
    });
  };

  const handleOpenFanActivity = (activity: FanActivity) => {
    setSelectedFanActivity(activity);
  };

  const handleCloseFanActivity = () => {
    setSelectedFanActivity(null);
  };

  const handleDeleteFanActivity = useCallback(
    (fanActivityId: string) => {
      setFanActivities((current) =>
        current.filter((activity) => activity.id !== fanActivityId),
      );
      setSelectedFanActivity((current) =>
        current?.id === fanActivityId ? null : current,
      );
      void loadFanActivities();
    },
    [loadFanActivities],
  );

  const handleDeleteEvent = async () => {
    Alert.alert('Slet event', 'Er du sikker på du vil slette dette event?', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) {
            Alert.alert('Fejl', 'Kunne ikke slette eventet.');
          } else {
            navigation.goBack();
          }
        },
      },
    ]);
  };

  if (loading) {
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
          <Text variant="h3" color="inverse">
            Event detaljer
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="body" color="secondary" style={styles.mt3}>
            Henter event...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
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
          <Text variant="h3" color="inverse">
            Event detaljer
          </Text>
        </View>
        <View style={styles.centered}>
          <Ionicons
            name="calendar-outline"
            size={theme.spacing[16]}
            color={theme.colors.text.muted}
          />
          <Text variant="body" color="secondary" style={styles.mt3}>
            Kunne ikke finde eventet
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const coverUrl = getCoverUrl(event);
  const dateStr = formatDateDa(event.start_at);
  const timeStr = formatTimeDa(event.start_at);
  const endStr = event.end_at ? formatTimeDa(event.end_at) : null;
  const addressDisplay = buildAddressDisplay(event);
  const attendeeCountLabel = formatAttendeeCount(attendance.countGoing);
  const canCreateFanActivities = Boolean(
    event.organizer_group_id && (communityRole === 'owner' || communityRole === 'admin'),
  );
  const showFanActivitiesSection = fanActivities.length > 0 || canCreateFanActivities;

  const showEditOption = canEditEvent(
    user?.id,
    isAppAdmin,
    { created_by: event.created_by, organizer_group_id: event.organizer_group_id },
    communityRole,
  );
  const showDeleteOption = canDeleteEvent(
    user?.id,
    isAppAdmin,
    { created_by: event.created_by, organizer_group_id: event.organizer_group_id },
    communityRole,
  );

  const menuOptions: OptionsMenuOption[] = [];
  if (showEditOption) {
    menuOptions.push({ label: 'Redigér', onPress: handleEditEvent, icon: 'create-outline' });
  }
  if (showDeleteOption) {
    menuOptions.push({
      label: 'Slet',
      onPress: handleDeleteEvent,
      destructive: true,
      icon: 'trash-outline',
    });
  }

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
          Event detaljer
        </Text>
        <View style={styles.headerSpacer} />
        {menuOptions.length > 0 && (
          <OptionsMenu
            options={menuOptions}
            iconColor={theme.colors.bg.card}
            iconSize={theme.components.icon.size.md}
          />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + theme.spacing[11]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing[8] }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.coverContainer}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons
                  name="image-outline"
                  size={theme.spacing[12]}
                  color={theme.colors.text.muted}
                />
              </View>
            )}
            <View style={styles.badgeOverlay}>
              <EventSubtypeBadge subtype="event" overlay />
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="h2" color="primary" style={styles.title}>
              {event.title}
            </Text>
            {event.organizer && (
              <Text variant="body" color="secondary">
                Arrangeret af {event.organizer.name}
              </Text>
            )}
          </View>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Detaljer
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaIconCircle}>
                <Ionicons
                  name="calendar-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.metaContent}>
                <Text variant="caption" color="muted">
                  Dato og tidspunkt
                </Text>
                <Text variant="body" color="primary" style={styles.metaValue}>
                  {dateStr}, kl. {timeStr}
                  {endStr && ` – ${endStr}`}
                </Text>
              </View>
            </View>

            {(event.location_name || addressDisplay) && (
              <View style={styles.metaRow}>
                <View style={styles.metaIconCircle}>
                  <Ionicons
                    name="location-outline"
                    size={theme.components.icon.size.sm}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.metaContent}>
                  <Text variant="caption" color="muted">
                    Sted
                  </Text>
                  {event.location_name && (
                    <Text variant="body" color="primary" style={styles.metaValue}>
                      {event.location_name}
                    </Text>
                  )}
                  {addressDisplay && (
                    <Text variant="caption" color="secondary">
                      {addressDisplay}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </Card>

          <Card style={styles.card}>
            <View style={styles.attendanceCardHeader}>
              <View style={styles.attendanceCopy}>
                <Text variant="h3" color="primary" style={styles.attendanceTitle}>
                  {attendance.isGoing ? 'Du deltager' : 'Skal du med?'}
                </Text>
                <Text variant="body" color="secondary">
                  {attendeeCountLabel}
                </Text>
              </View>
              <Pressable
                style={styles.attendeesPreviewButton}
                onPress={() => (navigation as any).navigate('EventAttendees', { eventId: event.id })}
              >
                <AttendanceBubbles
                  avatars={attendance.avatars}
                  count={attendance.countGoing}
                  max={5}
                  size={theme.spacing[5]}
                  textVariant="caption"
                />
              </Pressable>
            </View>

            <View style={styles.attendanceActions}>
              <Pressable
                style={[
                  styles.joinButton,
                  {
                    backgroundColor: attendance.isGoing
                      ? theme.colors.primary
                      : theme.colors.bg.card,
                    borderColor: theme.colors.primary,
                    borderWidth: theme.layout.borderWidth,
                  },
                ]}
                onPress={attendance.toggleGoing}
                disabled={attendance.loading}
              >
                <Ionicons
                  name={attendance.isGoing ? 'checkmark-circle' : 'person-add'}
                  size={theme.components.icon.size.sm}
                  color={attendance.isGoing ? theme.colors.text.inverse : theme.colors.primary}
                />
                <Text
                  variant="body"
                  style={{
                    color: attendance.isGoing ? theme.colors.text.inverse : theme.colors.primary,
                    fontWeight: '600',
                    marginLeft: theme.spacing[2],
                  }}
                >
                  {attendance.isGoing ? 'Du deltager' : 'Jeg kommer'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryLinkButton}
                onPress={() => (navigation as any).navigate('EventAttendees', { eventId: event.id })}
              >
                <Text variant="caption" style={styles.secondaryLinkText}>
                  Se deltagere
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.text.secondary}
                />
              </Pressable>
              {attendance.error ? (
                <Text variant="caption" color="secondary" style={styles.attendanceError}>
                  {attendance.error}
                </Text>
              ) : null}
            </View>
          </Card>

          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={handleShare}>
              <Ionicons
                name="share-outline"
                size={theme.spacing[5]}
                color={theme.colors.text.primary}
              />
              <Text variant="caption" style={styles.actionLabel}>
                Del
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionButton,
                !(event.lat != null && event.lng != null) &&
                  !event.location_address &&
                  !(event.address_line1 || event.postal_code || event.city) && {
                    opacity: 0.5,
                  },
              ]}
              onPress={handleFindvej}
              disabled={
                !(event.lat != null && event.lng != null) &&
                !event.location_address &&
                !(event.address_line1 || event.postal_code || event.city)
              }
            >
              <Ionicons
                name="location-outline"
                size={theme.spacing[5]}
                color={theme.colors.text.primary}
              />
              <Text variant="caption" style={styles.actionLabel}>
                Find vej
              </Text>
            </Pressable>
          </View>

          {event.description ? (
            <Card style={styles.card}>
              <Text variant="h3" color="primary" style={styles.sectionTitle}>
                Om eventet
              </Text>
              <Text variant="body" color="primary" style={styles.description}>
                {event.description}
              </Text>
            </Card>
          ) : null}

          {showFanActivitiesSection ? (
            <Card style={styles.card}>
              <View style={styles.fanActivitiesHeader}>
                <View style={styles.fanActivitiesHeaderCopy}>
                  <Text variant="caption" color="secondary" style={styles.fanActivitiesEyebrow}>
                    KAMPDAGSLAG
                  </Text>
                  <Text
                    variant="h3"
                    color="primary"
                    style={[styles.sectionTitle, styles.sectionTitleCompact]}
                  >
                    Fanaktiviteter
                  </Text>
                </View>
                {canCreateFanActivities ? (
                  <Pressable style={styles.fanActivitiesCta} onPress={handleCreateFanActivity}>
                    <Ionicons
                      name="add"
                      size={theme.components.icon.size.sm}
                      color={theme.colors.text.secondary}
                    />
                    <Text variant="caption" color="secondary" style={styles.fanActivitiesCtaText}>
                      Tilføj fanaktivitet
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <FanActivitiesShowcase
                activities={fanActivities}
                onPressActivity={handleOpenFanActivity}
              />
            </Card>
          ) : null}

          {event.organizer && (
            <Card style={styles.card}>
              <Text variant="h3" color="primary" style={styles.sectionTitle}>
                Arrangør
              </Text>
              <View style={styles.organizerRow}>
                <Avatar
                  avatarUrl={event.organizer.logo_url}
                  size={theme.spacing[12]}
                  label={event.organizer.name}
                />
                <View style={styles.organizerInfo}>
                  <Text variant="body" color="primary" style={styles.organizerName}>
                    {event.organizer.name}
                  </Text>
                  {event.organizer.description && (
                    <Text variant="caption" color="secondary" numberOfLines={2}>
                      {event.organizer.description}
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          )}

          <View style={styles.section}>
            <InlineComments
              targetType="event"
              targetId={event.id}
              currentUserId={user?.id || ''}
              isAppAdmin={isAppAdmin}
              variant="inline"
              maxInlineComments={Infinity}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <FanActivityDetailSheet
        visible={Boolean(selectedFanActivity)}
        activity={selectedFanActivity}
        onClose={handleCloseFanActivity}
        onDeleted={handleDeleteFanActivity}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  flex: {
    flex: 1,
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
  headerSpacer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.default,
  },
  mt3: {
    marginTop: theme.spacing[3],
  },
  coverContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.bg.subtle,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.subtle,
  },
  badgeOverlay: {
    position: 'absolute',
    top: theme.spacing[3],
    left: theme.spacing[3],
  },
  section: {
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[4],
  },
  card: {
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    marginBottom: theme.spacing[3],
    fontWeight: '700',
  },
  sectionTitleCompact: {
    marginBottom: theme.spacing[0],
  },
  title: {
    marginBottom: theme.spacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[3],
  },
  metaIconCircle: {
    width: theme.spacing[9],
    height: theme.spacing[9],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[3],
  },
  metaContent: {
    flex: 1,
    paddingTop: theme.spacing[1],
  },
  attendanceCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  attendanceCopy: {
    flex: 1,
  },
  attendanceTitle: {
    fontWeight: '600',
  },
  attendeesPreviewButton: {
    minWidth: theme.spacing[12],
    alignItems: 'flex-end',
  },
  metaValue: {
    fontWeight: '600',
    marginTop: theme.spacing[0],
  },
  description: {
    lineHeight: theme.spacing[6],
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[3],
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: theme.spacing[16] * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing[12],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
  },
  actionLabel: {
    marginTop: theme.spacing[1],
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  organizerInfo: {
    flex: 1,
  },
  organizerName: {
    fontWeight: '600',
  },
  fanActivitiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  fanActivitiesHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  fanActivitiesEyebrow: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[1],
  },
  fanActivitiesCta: {
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
  fanActivitiesCtaText: {
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  attendanceActions: {
    width: '100%',
    gap: theme.spacing[2],
  },
  attendanceError: {
    textAlign: 'left',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.md,
  },
  secondaryLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[1],
  },
  secondaryLinkText: {
    color: theme.colors.text.secondary,
    fontWeight: '600',
  },
});
