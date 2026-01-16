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
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { fetchEventById, type Event } from '../services/eventsApi';
import { colors, spacing } from '../theme';

type EventDetailsRouteProp = RouteProp<
  { EventDetails: { eventId: string } },
  'EventDetails'
>;

export default function EventDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<EventDetailsRouteProp>();
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEvent = async () => {
    console.log('[EventDetailsScreen] Loading event:', eventId);
    setLoading(true);
    const data = await fetchEventById(eventId);
    console.log('[EventDetailsScreen] Event data received:', data);
    setEvent(data);
    setLoading(false);
  };

  const handleShare = async () => {
    if (!event) return;
    try {
      await Share.share({
        message: `${event.title}\n${event.description || ''}\n📅 ${new Date(
          event.start_at
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Event detaljer</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
          <Text style={styles.loadingText}>Henter event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.card} />
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Event detaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
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
            <Text style={styles.subtitle}>
              Arrangeret af {event.organizer.name}
            </Text>
          )}
        </Card>

        {/* Event Details */}
        <Card style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Detaljer</Text>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color={colors.fcnRed} />
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
              <Ionicons name="location" size={20} color={colors.fcnRed} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Sted</Text>
                <Text style={styles.detailValue}>{event.location_name}</Text>
                {event.location_address && (
                  <Text style={styles.detailSubvalue}>
                    {event.location_address}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="people" size={20} color={colors.fcnRed} />
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
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSetReminder}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.fcnRed} />
            <Text style={styles.actionText}>Påmindelse</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={colors.fcnRed} />
            <Text style={styles.actionText}>Del</Text>
          </TouchableOpacity>
        </View>

        {/* Organizer */}
        {event.organizer && (
          <Card style={styles.organizerCard}>
            <Text style={styles.sectionTitle}>Arrangør</Text>
            <View style={styles.organizerInfo}>
              {event.organizer.logo_url ? (
                <Image
                  source={{ uri: event.organizer.logo_url }}
                  style={styles.organizerLogo}
                />
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
                  <Text style={styles.organizerDescription}>
                    {event.organizer.description}
                  </Text>
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

        {/* Placeholder: Comments */}
        <Card style={styles.commentsCard}>
          <Text style={styles.sectionTitle}>Kommentarer (0)</Text>
          <Text style={styles.placeholderText}>
            Ingen kommentarer endnu. Vær den første!
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fcnRed,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.fcnRed,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.card,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.subtext,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 16,
    color: colors.text,
  },
  headerCard: {
    margin: spacing.md,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.fcnRed + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconEmoji: {
    fontSize: 40,
  },
  badge: {
    backgroundColor: '#34C759',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    marginBottom: spacing.sm,
  },
  badgeText: {
    color: colors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
  },
  detailsCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  detailText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  detailSubvalue: {
    fontSize: 13,
    color: colors.subtext,
    marginTop: 2,
  },
  descriptionCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  description: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    padding: spacing.md,
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  organizerCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: spacing.md,
  },
  organizerLogoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  organizerLogoText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  organizerText: {
    flex: 1,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  organizerDescription: {
    fontSize: 13,
    color: colors.subtext,
  },
  ctaContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  commentsCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.subtext,
    fontStyle: 'italic',
  },
});
