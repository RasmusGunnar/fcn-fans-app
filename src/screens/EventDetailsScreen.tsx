import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Share,
  Pressable,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { OptionsMenu, OptionsMenuOption } from '../components/OptionsMenu';
import { InlineComments } from '../components/comments/InlineComments';
import { fetchEventById, type Event } from '../services/eventsApi';
import { defaultTheme as theme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { canEditEvent, canDeleteEvent } from '../utils/permissions';
import { supabase } from '../lib/supabase';
import { useCommunityRole } from '../hooks/useCommunityRole';

type EventDetailsRouteProp = RouteProp<{ EventDetails: { eventId: string } }, 'EventDetails'>;

export default function EventDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<EventDetailsRouteProp>();
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAppAdmin } = useAuth();

  // Get community role for the event's organizer group (if set)
  const { role: communityRole } = useCommunityRole(event?.organizer_group_id);

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEvent = async () => {
    console.log('[EventDetailsScreen] Loading event:', eventId);
    setLoading(true);
    const data = await fetchEventById(eventId);
    if (__DEV__) {
      console.log('[EventDetailsScreen] Event data received:', {
        id: data?.id,
        title: data?.title,
        created_by: data?.created_by,
        organizer_group_id: data?.organizer_group_id,
        hasAllFields: !!(data?.created_by !== undefined && data?.organizer_group_id !== undefined),
      });
    }
    setEvent(data);
    setLoading(false);
  };

  const handleShare = async () => {
    if (!event) return;
    try {
      await Share.share({
        message: `${event.title}\n${event.description || ''}\n📅 ${new Date(
          event.start_at,
        ).toLocaleDateString('da-DK')}`,
        title: event.title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleSetReminder = () => {
    // TODO: Implement calendar integration
    console.log('Set reminder for event:', eventId);
  };

  const handleEditEvent = () => {
    // Navigate to edit screen
    (navigation as any).navigate('EditEvent', { eventId });
  };

  const handleDeleteEvent = async () => {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke slette eventet. Du har muligvis ikke rettigheder til dette.');
      console.warn('Delete event error', error);
    } else {
      Alert.alert('Slettet', 'Eventet er blevet slettet', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Event detaljer</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Henter event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Event detaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>📅</Text>
          <Text style={styles.errorText}>Kunne ikke finde eventet</Text>
        </View>
      </SafeAreaView>
    );
  }

  const startDate = new Date(event.start_at);
  const dateStr = startDate.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = startDate.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const endStr = event.end_at
    ? new Date(event.end_at).toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Permission checks - use isAppAdmin from context and community role
  const showEditOption = canEditEvent(
    user?.id,
    isAppAdmin,
    {
      created_by: event.created_by,
      organizer_group_id: event.organizer_group_id,
    },
    communityRole,
  );
  const showDeleteOption = canDeleteEvent(
    user?.id,
    isAppAdmin,
    {
      created_by: event.created_by,
      organizer_group_id: event.organizer_group_id,
    },
    communityRole,
  );

  const eventMenuOptions: OptionsMenuOption[] = [];
  if (showEditOption) {
    eventMenuOptions.push({ label: 'Redigér', onPress: handleEditEvent, icon: 'create-outline' });
  }
  if (showDeleteOption) {
    eventMenuOptions.push({
      label: 'Slet',
      onPress: handleDeleteEvent,
      destructive: true,
      icon: 'trash-outline',
    });
  }

  // Debug logging for permissions
  if (__DEV__) {
    console.log('EVENT PERM', {
      isAppAdmin,
      created_by: event.created_by,
      org: event.organizer_group_id,
      showEditOption,
      showDeleteOption,
      menuOptionsCount: eventMenuOptions.length,
      userId: user?.id,
      userIdMatchesCreator: event.created_by === user?.id,
      communityRole,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Event detaljer</Text>
        <View style={{ flex: 1 }} />
        {eventMenuOptions.length > 0 && (
          <OptionsMenu options={eventMenuOptions} iconColor={theme.colors.bg.card} iconSize={24} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing[6] }}
      >
        {/* Header Card with Icon */}
        <Card style={styles.headerCard}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🎉</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>EVENT</Text>
          </View>
          <Text style={styles.title}>{event.title}</Text>
          {event.organizer && (
            <Text style={styles.subtitle}>Arrangeret af {event.organizer.name}</Text>
          )}
        </Card>

        {/* Event Details */}
        <Card style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Detaljer</Text>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color={theme.colors.primary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>Dato og tidspunkt</Text>
              <Text style={styles.detailValue}>
                {dateStr}, kl. {timeStr}
                {endStr && ` - ${endStr}`}
              </Text>
            </View>
          </View>

          {event.location_name && (
            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={theme.colors.primary} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Sted</Text>
                <Text style={styles.detailValue}>{event.location_name}</Text>
                {event.location_address && (
                  <Text style={styles.detailSubvalue}>{event.location_address}</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="people" size={20} color={theme.colors.primary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>Deltagere</Text>
              <Text style={styles.detailValue}>42 interesserede</Text>
            </View>
          </View>
        </Card>

        {/* Description */}
        {event.description && (
          <Card style={styles.descriptionCard}>
            <Text style={styles.sectionTitle}>Om eventet</Text>
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleSetReminder}>
            <Ionicons name="notifications-outline" size={24} color={theme.colors.primary} />
            <Text style={styles.actionText}>Påmindelse</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={theme.colors.primary} />
            <Text style={styles.actionText}>Del</Text>
          </TouchableOpacity>
        </View>

        {/* Organizer */}
        {event.organizer && (
          <Card style={styles.organizerCard}>
            <Text style={styles.sectionTitle}>Arrangør</Text>
            <View style={styles.organizerInfo}>
              {event.organizer.logo_url ? (
                <Image source={{ uri: event.organizer.logo_url }} style={styles.organizerLogo} />
              ) : (
                <View style={styles.organizerLogoPlaceholder}>
                  <Text style={styles.organizerLogoText}>
                    {event.organizer.name.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.organizerText}>
                <Text style={styles.organizerName}>{event.organizer.name}</Text>
                {event.organizer.description && (
                  <Text style={styles.organizerDescription}>{event.organizer.description}</Text>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* CTA Button */}
        <View style={styles.ctaContainer}>
          <PrimaryButton
            title="Tilmeld mig"
            onPress={() => {
              // TODO: Implement RSVP
              console.log('RSVP to event:', eventId);
            }}
          />
        </View>

        {/* Comments Section */}
        {event && (
          <View style={styles.commentsSection}>
            <InlineComments
              targetType="event"
              targetId={event.id}
              currentUserId={user?.id || ''}
              isAppAdmin={isAppAdmin}
              variant="screen"
            />
          </View>
        )}
      </ScrollView>
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
    paddingVertical: theme.spacing[4],
    backgroundColor: theme.colors.primary,
  },
  backButton: {
    padding: theme.spacing[1],
    marginRight: theme.spacing[2],
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.bg.card,
  },
  scrollView: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.default,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.default,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  headerCard: {
    margin: theme.spacing[4],
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  iconEmoji: {
    fontSize: 40,
  },
  badge: {
    backgroundColor: theme.colors.state.success,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing[2],
  },
  badgeText: {
    color: theme.colors.bg.card,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[1],
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  detailsCard: {
    margin: theme.spacing[4],
    marginTop: theme.spacing[0],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing[4],
  },
  detailText: {
    flex: 1,
    marginLeft: theme.spacing[2],
  },
  detailLabel: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[0],
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  detailSubvalue: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[0],
  },
  descriptionCard: {
    margin: theme.spacing[4],
    marginTop: theme.spacing[0],
  },
  description: {
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 22,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  actionButton: {
    alignItems: 'center',
    padding: theme.spacing[4],
    flex: 1,
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginTop: theme.spacing[1],
  },
  organizerCard: {
    margin: theme.spacing[4],
    marginTop: theme.spacing[0],
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerLogo: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.pill,
    marginRight: theme.spacing[4],
  },
  organizerLogoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[4],
  },
  organizerLogoText: {
    color: theme.colors.bg.card,
    fontSize: 16,
    fontWeight: '700',
  },
  organizerText: {
    flex: 1,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  organizerDescription: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  ctaContainer: {
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  commentsSection: {
    margin: theme.spacing[4],
    marginTop: theme.spacing[0],
  },
  commentsCard: {
    margin: theme.spacing[4],
    marginTop: theme.spacing[0],
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
  },
});
