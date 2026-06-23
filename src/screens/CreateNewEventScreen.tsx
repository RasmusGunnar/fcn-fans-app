import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import { ActorSelector } from '../components/ActorSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { Card } from '../components/ui/Card';
import { OutlineButton } from '../components/ui/OutlineButton';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import { deleteEventCover, pickAndUploadEventCover } from '../lib/uploadEventCover';
import { useFeed } from '../state/FeedContext';
import { colors, spacing } from '../theme';
import type { Actor } from '../types/news';
import { resolveProfileDisplayName } from '../utils/actor';

async function geocodeNominatim(
  q: string,
): Promise<{ lat: number; lng: number; place_name: string } | null> {
  if (!q.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      place_name: data[0].display_name || q,
    };
  } catch {
    return null;
  }
}

export default function CreateNewEventScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profileMap } = useFeed();
  const styles = createStyles();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Danmark');

  // Capacity fields
  const [hasCapacityLimit, setHasCapacityLimit] = useState(false);
  const [capacity, setCapacity] = useState('');

  // Cover image
  const [coverBucket, setCoverBucket] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  // Default: 1 hour from now so the event is clearly in the future
  const [startDate, setStartDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const displayName = resolveProfileDisplayName(profileMap, user.id, user.email || undefined);
    setSelectedActor(
      (prev) =>
        prev ?? {
          type: 'user',
          id: user.id,
          name: displayName,
        },
    );
  }, [user?.id, user?.email, profileMap]);

  // -- Cover image helpers (need a temp ID for upload path) --
  const tempEventId = React.useRef(`new-${Date.now()}`).current;

  const pickCover = (source: 'gallery' | 'camera') => {
    setUploadingCover(true);
    pickAndUploadEventCover(tempEventId, source)
      .then((result) => {
        if (result) {
          setCoverBucket(result.bucket);
          setCoverPath(result.path);
        }
      })
      .finally(() => setUploadingCover(false));
  };

  const removeCover = () => {
    if (coverPath) deleteEventCover(coverPath);
    setCoverBucket(null);
    setCoverPath(null);
  };

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

    if (!locationName.trim()) {
      Alert.alert('Fejl', 'Sted er påkrævet');
      return false;
    }
    if (hasCapacityLimit) {
      if (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) <= 0) {
        Alert.alert('Fejl', 'Angiv et gyldigt antal pladser (større end 0)');
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
      const organizerType = selectedActor.type === 'community' ? 'community' : 'fan';
      const organizerId = selectedActor.id;

      const addressText = [addressLine1, [postalCode, city].filter(Boolean).join(' '), country]
        .filter(Boolean)
        .join(', ');

      // Geocode the location
      const geocodeInput =
        (addressText ?? '').trim() ||
        [addressLine1.trim(), locationName.trim()].filter(Boolean).join(', ').trim();
      let geo: { lat: number; lng: number; place_name: string } | null = null;
      if (geocodeInput) {
        logger.log('[event geocode] query=', geocodeInput);
        geo = (await geocodeNominatim(geocodeInput)) as {
          lat: number;
          lng: number;
          place_name: string;
        } | null;
        logger.log('[event geocode] geo=', geo);
        if (!geo) {
          Alert.alert(
            'Adresse ikke fundet',
            'Kunne ikke finde adressen – event vises ikke på kortet.',
          );
        }
      }

      const insertPayload: Record<string, any> = {
        title: title.trim(),
        description: description.trim() || null,
        location_name: locationName.trim(),
        location_address: addressLine1.trim() || null,
        address_line1: addressLine1.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || 'Danmark',
        address_text: addressText || null,
        cover_bucket: coverBucket,
        cover_path: coverPath,
        start_at: startDate.toISOString(),
        created_by: user.id,
        creator_user_id: user.id,
        organizer_type: organizerType,
        organizer_id: organizerId,
        organizer_group_id: organizerType === 'community' ? organizerId : null,
        capacity: hasCapacityLimit ? Number(capacity) : null,
      };

      if (geo) {
        insertPayload.lat = geo.lat;
        insertPayload.lng = geo.lng;
        insertPayload.place_name = geo.place_name;
        insertPayload.geocoded_at = new Date().toISOString();
      }

      if (__DEV__) {
        console.log(
          '[CreateNewEventScreen] INSERT payload:',
          JSON.stringify(insertPayload, null, 2),
        );
      }

      // Create event
      const { data, error } = await supabase.from('events').insert(insertPayload).select().single();

      if (error) throw error;

      logger.log('[CreateNewEventScreen] Event created:', data);

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
            (navigation as any).navigate('Main', {
              screen: 'Events',
              params: { screen: 'EventDetails', params: { eventId: data.id } },
            });
          },
        },
      ]);
    } catch (error: any) {
      logger.error('Error creating:', error);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Opret nyt</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.formArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xl + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
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
              placeholder="F.eks. Pre-match møde"
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

          {/* Event fields */}
          {/* Cover Image */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Cover billede</Text>
            <Pressable
              onPress={() => {
                if (Platform.OS === 'ios') {
                  const opts = [
                    'Vælg fra galleri',
                    'Tag billede',
                    ...(coverPath ? ['Fjern billede'] : []),
                    'Annullér',
                  ];
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      options: opts,
                      cancelButtonIndex: opts.length - 1,
                      destructiveButtonIndex: coverPath ? opts.length - 2 : undefined,
                    },
                    (idx) => {
                      if (idx === 0) pickCover('gallery');
                      else if (idx === 1) pickCover('camera');
                      else if (coverPath && idx === 2) removeCover();
                    },
                  );
                } else {
                  Alert.alert('Cover billede', 'Vælg en mulighed', [
                    { text: 'Galleri', onPress: () => pickCover('gallery') },
                    { text: 'Kamera', onPress: () => pickCover('camera') },
                    ...(coverPath
                      ? [{ text: 'Fjern', style: 'destructive' as const, onPress: removeCover }]
                      : []),
                    { text: 'Annullér', style: 'cancel' as const },
                  ]);
                }
              }}
              style={styles.coverPicker}
            >
              {uploadingCover ? (
                <View style={styles.coverPlaceholder}>
                  <ActivityIndicator color={colors.fcnRed} />
                </View>
              ) : coverPath && coverBucket ? (
                <Image
                  source={{ uri: getPublicUrl(coverBucket, coverPath) || undefined }}
                  style={styles.coverPreview}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={spacing.xl} color={colors.subtext} />
                  <Text style={styles.coverPlaceholderText}>Tryk for at tilføje billede</Text>
                </View>
              )}
            </Pressable>
          </Card>

          {/* Location */}
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
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="F.eks. Pernille Højers Vej 1"
              placeholderTextColor={colors.subtext}
            />

            <View style={styles.rowFields}>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Postnr.</Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="3520"
                  placeholderTextColor={colors.subtext}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>By</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Farum"
                  placeholderTextColor={colors.subtext}
                />
              </View>
            </View>

            <Text style={styles.label}>Land</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg, color: colors.subtext }]}
              value={country}
              onChangeText={setCountry}
              placeholderTextColor={colors.subtext}
            />
          </Card>

          {/* Capacity */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Kapacitet</Text>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => {
                setHasCapacityLimit(!hasCapacityLimit);
                if (hasCapacityLimit) {
                  setCapacity('');
                }
              }}
            >
              <View style={[styles.checkbox, !hasCapacityLimit && styles.checkboxChecked]}>
                {!hasCapacityLimit && <Ionicons name="checkmark" size={16} color={colors.text} />}
              </View>
              <Text style={styles.checkboxLabel}>Ingen loft (ubegrænset antal deltagere)</Text>
            </Pressable>

            {hasCapacityLimit && (
              <>
                <Text style={styles.label}>Antal pladser *</Text>
                <TextInput
                  style={styles.input}
                  value={capacity}
                  onChangeText={setCapacity}
                  placeholder="F.eks. 50"
                  placeholderTextColor={colors.subtext}
                  keyboardType="numeric"
                />
                <Text style={styles.helperText}>
                  Hvor mange deltagere må tilmelde sig dette event
                </Text>
              </>
            )}
          </Card>

          {/* Submit Button */}
          <View style={styles.buttonContainer}>
            <PrimaryButton
              title={submitting ? 'Opretter...' : 'Opret event'}
              onPress={handleSubmit}
              disabled={submitting}
            />
            <View style={{ height: spacing.sm }} />
            <OutlineButton title="Annuller" onPress={() => navigation.goBack()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    formArea: {
      flex: 1,
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
    scrollContent: {
      padding: spacing.md,
      flexGrow: 1,
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
    rowFields: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    fieldHalf: {
      flex: 1,
    },
    coverPicker: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: spacing.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    coverPreview: {
      width: '100%',
      height: '100%',
    },
    coverPlaceholder: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg,
    },
    coverPlaceholderText: {
      fontSize: 13,
      color: colors.subtext,
      marginTop: spacing.xs,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: spacing.xs,
      marginRight: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    checkboxChecked: {
      backgroundColor: colors.fcnRed,
      borderColor: colors.fcnRed,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },
    helperText: {
      fontSize: 12,
      color: colors.subtext,
      marginTop: spacing.xs,
      fontStyle: 'italic',
    },
  });
