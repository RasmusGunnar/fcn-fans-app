import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { OutlineButton } from '../components/ui/OutlineButton';
import { colors, spacing } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { countOwnedCommunities } from '../services/profileApi';
import { ActorSelector } from '../components/ActorSelector';
import { useFeed } from '../state/FeedContext';
import type { Actor } from '../types/news';
import { resolveProfileDisplayName } from '../utils/actor';

type EventType = 'event' | 'bus_trip';

export default function CreateNewEventScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profileMap } = useFeed();
  const styles = createStyles();

  // Check if user can create bus trips
  const [canCreateBusTrip, setCanCreateBusTrip] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);

  // Form state
  const [eventType, setEventType] = useState<EventType>('event');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Bus trip specific fields
  const [departurePlace, setDeparturePlace] = useState('');
  const [price, setPrice] = useState('');
  const [seats, setSeats] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  const checkUserPermissions = async () => {
    if (!user?.id) {
      setCheckingPermissions(false);
      return;
    }

    try {
      const ownedCount = await countOwnedCommunities(user.id);
      setCanCreateBusTrip(ownedCount > 0);
    } catch (error) {
      console.error('Error checking permissions:', error);
    } finally {
      setCheckingPermissions(false);
    }
  };

  useEffect(() => {
    checkUserPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const displayName = resolveProfileDisplayName(profileMap, user.id, user.email || undefined);
    setSelectedActor((prev) =>
      prev ?? {
        type: 'user',
        id: user.id,
        name: displayName,
      },
    );
  }, [user?.id, user?.email, profileMap]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(startDate);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setStartDate(newDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(startDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setStartDate(newDate);
    }
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Titel er påkrævet');
      return false;
    }

    if (eventType === 'event') {
      if (!locationName.trim()) {
        Alert.alert('Fejl', 'Sted er påkrævet');
        return false;
      }
    } else {
      // Bus trip validation
      if (!departurePlace.trim()) {
        Alert.alert('Fejl', 'Afgangssted er påkrævet for busture');
        return false;
      }
      if (!price.trim() || isNaN(Number(price))) {
        Alert.alert('Fejl', 'Angiv en gyldig pris');
        return false;
      }
      if (!seats.trim() || isNaN(Number(seats))) {
        Alert.alert('Fejl', 'Angiv antal pladser');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!user?.id) {
      Alert.alert('Fejl', 'Du skal være logget ind');
      return;
    }

    if (!selectedActor) {
      Alert.alert('Fejl', 'Vælg hvem du opretter som');
      return;
    }

    setSubmitting(true);

    try {
      if (eventType === 'event') {
        const organizerType = selectedActor.type === 'community' ? 'community' : 'fan';
        const organizerId = selectedActor.id;
        // Create event
        const { data, error } = await supabase
          .from('events')
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            location_name: locationName.trim(),
            location_address: locationAddress.trim() || null,
            start_at: startDate.toISOString(),
            created_by: user.id,
            creator_user_id: user.id,
            organizer_type: organizerType,
            organizer_id: organizerId,
            organizer_group_id: organizerType === 'community' ? organizerId : null,
          })
          .select()
          .single();

        if (error) throw error;

        console.log('[CreateNewEventScreen] Event created:', data);

        // Auto-add to user's upcoming items
        const { error: upcomingError } = await supabase.from('user_upcoming_items').insert({
          user_id: user.id,
          target_type: 'event',
          target_id: data.id,
          status: 'going',
        });

        if (upcomingError) {
          console.error('[CreateNewEventScreen] Error adding to upcoming items:', upcomingError);
        } else {
          console.log('[CreateNewEventScreen] Added to upcoming items');
        }

        Alert.alert('Succes!', 'Event oprettet', [
          {
            text: 'OK',
            onPress: () => {
              (navigation as any).navigate('EventDetails', { eventId: data.id });
            },
          },
        ]);
      } else {
        // Create bus trip
        const { data, error } = await supabase
          .from('bus_trips')
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            departure_place: departurePlace.trim(),
            start_at: startDate.toISOString(),
            price_dkk: Number(price),
            total_seats: Number(seats),
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        console.log('[CreateNewEventScreen] Bus trip created:', data);

        // Auto-add to user's upcoming items
        const { error: upcomingError } = await supabase.from('user_upcoming_items').insert({
          user_id: user.id,
          target_type: 'bus_trip',
          target_id: data.id,
          status: 'going',
        });

        if (upcomingError) {
          console.error('[CreateNewEventScreen] Error adding to upcoming items:', upcomingError);
        } else {
          console.log('[CreateNewEventScreen] Added to upcoming items');
        }

        Alert.alert('Succes!', 'Bustur oprettet', [
          {
            text: 'OK',
            onPress: () => {
              (navigation as any).navigate('BusTripDetails', { busTripId: data.id });
            },
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error creating:', error);
      Alert.alert('Fejl', error.message || 'Kunne ikke oprette');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date: Date): string => {
    const days = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
    const months = [
      'januar',
      'februar',
      'marts',
      'april',
      'maj',
      'juni',
      'juli',
      'august',
      'september',
      'oktober',
      'november',
      'december',
    ];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${dayName} ${day}. ${month}`;
  };

  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  if (checkingPermissions) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Opret nyt</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Opret nyt</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 24 }}
      >
        {/* Type Selector */}
        <Card style={styles.card}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeSelector}>
            <Pressable
              style={[styles.typeButton, eventType === 'event' && styles.typeButtonActive]}
              onPress={() => setEventType('event')}
            >
              <Ionicons
                name="calendar"
                size={20}
                color={eventType === 'event' ? colors.card : colors.subtext}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  eventType === 'event' && styles.typeButtonTextActive,
                ]}
              >
                Event
              </Text>
            </Pressable>

            {canCreateBusTrip && (
              <Pressable
                style={[styles.typeButton, eventType === 'bus_trip' && styles.typeButtonActive]}
                onPress={() => setEventType('bus_trip')}
              >
                <Ionicons
                  name="bus"
                  size={20}
                  color={eventType === 'bus_trip' ? colors.card : colors.subtext}
                />
                <Text
                  style={[
                    styles.typeButtonText,
                    eventType === 'bus_trip' && styles.typeButtonTextActive,
                  ]}
                >
                  Bustur
                </Text>
              </Pressable>
            )}
          </View>
        </Card>

        {/* Basic Info */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Grundlæggende information</Text>

          {selectedActor ? (
            <ActorSelector selectedActor={selectedActor} onSelectActor={setSelectedActor} />
          ) : null}

          <Text style={styles.label}>Titel *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={
              eventType === 'event' ? 'F.eks. Pre-match møde' : 'F.eks. Bustur til Silkeborg'
            }
            placeholderTextColor={colors.subtext}
          />

          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tilføj en beskrivelse..."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={4}
          />
        </Card>

        {/* Date & Time */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Dato & tid</Text>

          <Pressable style={styles.dateTimeRow} onPress={() => setShowDatePicker(true)}>
            <View style={styles.dateTimeIcon}>
              <Ionicons name="calendar-outline" size={20} color={colors.fcnRed} />
            </View>
            <View style={styles.dateTimeText}>
              <Text style={styles.dateTimeLabel}>Dato</Text>
              <Text style={styles.dateTimeValue}>{formatDate(startDate)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </Pressable>

          <Pressable style={styles.dateTimeRow} onPress={() => setShowTimePicker(true)}>
            <View style={styles.dateTimeIcon}>
              <Ionicons name="time-outline" size={20} color={colors.fcnRed} />
            </View>
            <View style={styles.dateTimeText}>
              <Text style={styles.dateTimeLabel}>Tidspunkt</Text>
              <Text style={styles.dateTimeValue}>Kl. {formatTime(startDate)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtext} />
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={startDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
            />
          )}
        </Card>

        {/* Event-specific fields */}
        {eventType === 'event' && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Sted</Text>

            <Text style={styles.label}>Stednavn *</Text>
            <TextInput
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="F.eks. Farum Kro"
              placeholderTextColor={colors.subtext}
            />

            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={styles.input}
              value={locationAddress}
              onChangeText={setLocationAddress}
              placeholder="F.eks. Hovedgaden 10, 3520 Farum"
              placeholderTextColor={colors.subtext}
            />
          </Card>
        )}

        {/* Bus trip-specific fields */}
        {eventType === 'bus_trip' && (
          <>
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Afgang</Text>

              <Text style={styles.label}>Afgangssted *</Text>
              <TextInput
                style={styles.input}
                value={departurePlace}
                onChangeText={setDeparturePlace}
                placeholder="F.eks. Farum Station"
                placeholderTextColor={colors.subtext}
              />
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Detaljer</Text>

              <Text style={styles.label}>Pris (kr.) *</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="F.eks. 150"
                placeholderTextColor={colors.subtext}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Antal pladser *</Text>
              <TextInput
                style={styles.input}
                value={seats}
                onChangeText={setSeats}
                placeholder="F.eks. 40"
                placeholderTextColor={colors.subtext}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Arrangør</Text>
              <TextInput
                style={styles.input}
                value={organizer}
                onChangeText={setOrganizer}
                placeholder="F.eks. Farum Fans"
                placeholderTextColor={colors.subtext}
              />

              <Text style={styles.label}>Kontaktinfo</Text>
              <TextInput
                style={styles.input}
                value={contactInfo}
                onChangeText={setContactInfo}
                placeholder="F.eks. mail@example.com eller +45 12345678"
                placeholderTextColor={colors.subtext}
              />
            </Card>
          </>
        )}

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <PrimaryButton
            title={
              submitting ? 'Opretter...' : eventType === 'event' ? 'Opret event' : 'Opret bustur'
            }
            onPress={handleSubmit}
            disabled={submitting}
          />
          <View style={{ height: spacing.sm }} />
          <OutlineButton title="Annuller" onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
    },
    input: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.sm,
      padding: spacing.sm,
      fontSize: 16,
      color: colors.text,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    typeSelector: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    typeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.sm,
      gap: spacing.xs,
    },
    typeButtonActive: {
      backgroundColor: colors.fcnRed,
      borderColor: colors.fcnRed,
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.subtext,
    },
    typeButtonTextActive: {
      color: colors.card,
    },
    dateTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dateTimeIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderRadius: spacing.sm,
      marginRight: spacing.sm,
    },
    dateTimeText: {
      flex: 1,
    },
    dateTimeLabel: {
      fontSize: 12,
      color: colors.subtext,
      marginBottom: spacing.xs,
    },
    dateTimeValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    buttonContainer: {
      marginTop: spacing.md,
    },
  });
