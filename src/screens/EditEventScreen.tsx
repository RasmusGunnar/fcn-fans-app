// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { Text } from '../components/ui';
import { Card } from '../components/ui/Card';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import { deleteEventCover, pickAndUploadEventCover } from '../lib/uploadEventCover';
import { fetchEventById, type Event } from '../services/eventsApi';
import { defaultTheme as theme } from '../theme';

type EditEventRouteProp = RouteProp<{ EditEvent: { eventId: string } }, 'EditEvent'>;

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

export default function EditEventScreen() {
  const navigation = useNavigation();
  const route = useRoute<EditEventRouteProp>();
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Danmark');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Cover image
  const [coverBucket, setCoverBucket] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEvent = async () => {
    setLoading(true);
    const data = await fetchEventById(eventId);
    if (data) {
      setEvent(data);
      setTitle(data.title);
      setDescription(data.description || '');
      setLocationName(data.location_name || '');
      setAddressLine1(data.address_line1 || data.location_address || '');
      setPostalCode(data.postal_code || '');
      setCity(data.city || '');
      setCountry(data.country || 'Danmark');
      setStartDate(new Date(data.start_at));
      setEndDate(data.end_at ? new Date(data.end_at) : null);
      setCoverBucket(data.cover_bucket || null);
      setCoverPath(data.cover_path || null);
    }
    setLoading(false);
  };

  const coverUrl = coverBucket && coverPath ? getPublicUrl(coverBucket, coverPath) : null;

  // --- Cover actions ---
  const handlePickCover = (source: 'gallery' | 'camera') => {
    setUploadingCover(true);
    pickAndUploadEventCover(eventId, source)
      .then((result) => {
        if (result) {
          setCoverBucket(result.bucket);
          setCoverPath(result.path);
        }
      })
      .finally(() => setUploadingCover(false));
  };

  const handleRemoveCover = () => {
    if (coverPath) {
      deleteEventCover(coverPath);
    }
    setCoverBucket(null);
    setCoverPath(null);
  };

  const showCoverActions = () => {
    if (Platform.OS === 'ios') {
      const options = [
        'Vælg fra galleri',
        'Tag billede',
        ...(coverUrl ? ['Fjern billede'] : []),
        'Annullér',
      ];
      const cancelIndex = options.length - 1;
      const destructiveIndex = coverUrl ? options.length - 2 : undefined;

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (idx) => {
          if (idx === 0) handlePickCover('gallery');
          else if (idx === 1) handlePickCover('camera');
          else if (coverUrl && idx === 2) handleRemoveCover();
        },
      );
    } else {
      // Android fallback
      Alert.alert('Cover billede', 'Vælg en mulighed', [
        { text: 'Galleri', onPress: () => handlePickCover('gallery') },
        { text: 'Kamera', onPress: () => handlePickCover('camera') },
        ...(coverUrl
          ? [{ text: 'Fjern', style: 'destructive' as const, onPress: handleRemoveCover }]
          : []),
        { text: 'Annullér', style: 'cancel' as const },
      ]);
    }
  };

  // --- Date pickers ---
  const formatDateDa = (d: Date) =>
    d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'long' });
  const formatTimeDa = (d: Date) =>
    d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });

  // --- Save ---
  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Titel er påkrævet');
      return;
    }

    setSaving(true);
    try {
      const addressText = [addressLine1, [postalCode, city].filter(Boolean).join(' '), country]
        .filter(Boolean)
        .join(', ');

      // Geocode the location
      const geocodeInput =
        (addressText ?? '').trim() ||
        [addressLine1.trim(), locationName.trim()].filter(Boolean).join(', ').trim();
      let geo: { lat: number; lng: number; place_name: string } | null = null;
      if (geocodeInput) {
        console.log('[event geocode] query=', geocodeInput);
        geo = await geocodeNominatim(geocodeInput);
        console.log('[event geocode] geo=', geo);
        if (!geo) {
          Alert.alert(
            'Adresse ikke fundet',
            'Kunne ikke finde adressen – event vises ikke på kortet.',
          );
        }
      }

      const updates: Record<string, any> = {
        title: title.trim(),
        description: description.trim() || null,
        location_name: locationName.trim() || null,
        location_address: addressLine1.trim() || null,
        address_line1: addressLine1.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || 'Danmark',
        address_text: addressText || null,
        start_at: startDate.toISOString(),
        end_at: endDate ? endDate.toISOString() : null,
        cover_bucket: coverBucket,
        cover_path: coverPath,
      };

      if (geo) {
        updates.lat = geo.lat;
        updates.lng = geo.lng;
        updates.place_name = geo.place_name;
        updates.geocoded_at = new Date().toISOString();
      } else if (!geocodeInput) {
        // Clear coords if location was removed
        updates.lat = null;
        updates.lng = null;
        updates.place_name = null;
        updates.geocoded_at = null;
      }

      const { error } = await supabase.from('events').update(updates).eq('id', eventId);
      if (error) throw error;

      Alert.alert('Gemt', 'Eventet er blevet opdateret', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('[EditEventScreen] Save error:', error);
      Alert.alert('Fejl', error.message || 'Kunne ikke gemme ændringer.');
    } finally {
      setSaving(false);
    }
  };

  // --- Loading ---
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
            Redigér event
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
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
            Redigér event
          </Text>
        </View>
        <View style={styles.centered}>
          <Text variant="body" color="secondary">
            Kunne ikke finde eventet
          </Text>
        </View>
      </SafeAreaView>
    );
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
        <Text variant="h3" color="inverse" style={{ fontWeight: '700' }}>
          Redigér event
        </Text>
      </View>

      {/* KeyboardAvoidingView + sticky footer: "Gem" knap er ALTID synlig over tab bar */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover Image Picker */}
          <Card style={styles.formCard}>
            <Text variant="body" color="primary" style={styles.label}>
              Cover billede
            </Text>
            <Pressable onPress={showCoverActions} style={styles.coverPicker}>
              {uploadingCover ? (
                <View style={styles.coverPickerPlaceholder}>
                  <ActivityIndicator color={theme.colors.primary} />
                  <Text variant="caption" color="muted" style={styles.coverPickerText}>
                    Uploader...
                  </Text>
                </View>
              ) : coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.coverPreview} resizeMode="cover" />
              ) : (
                <View style={styles.coverPickerPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={theme.spacing[10]}
                    color={theme.colors.text.muted}
                  />
                  <Text variant="caption" color="muted" style={styles.coverPickerText}>
                    Tryk for at tilføje billede
                  </Text>
                </View>
              )}
            </Pressable>
            {coverUrl && (
              <View style={styles.coverActions}>
                <Pressable onPress={() => handlePickCover('gallery')}>
                  <Text variant="caption" color="primary" style={styles.coverActionLink}>
                    Skift foto
                  </Text>
                </Pressable>
                <Text variant="caption" color="muted">
                  {' '}
                </Text>
                <Pressable onPress={handleRemoveCover}>
                  <Text variant="caption" style={styles.coverRemoveLink}>
                    Fjern
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>

          {/* Basic Info */}
          <Card style={styles.formCard}>
            <Text variant="body" color="primary" style={styles.label}>
              Titel{' '}
              <Text variant="caption" style={{ color: theme.colors.error }}>
                *
              </Text>
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Pre-match møde"
              placeholderTextColor={theme.colors.text.muted}
            />

            <Text variant="body" color="primary" style={styles.label}>
              Beskrivelse
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskriv eventet..."
              placeholderTextColor={theme.colors.text.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Card>

          {/* Date & Time */}
          <Card style={styles.formCard}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Dato & tid
            </Text>

            <Pressable style={styles.dateRow} onPress={() => setShowStartDatePicker(true)}>
              <View style={styles.dateIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  Startdato
                </Text>
                <Text variant="body" color="primary" style={{ fontWeight: '600' }}>
                  {formatDateDa(startDate)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.muted}
              />
            </Pressable>

            <Pressable style={styles.dateRow} onPress={() => setShowStartTimePicker(true)}>
              <View style={styles.dateIcon}>
                <Ionicons
                  name="time-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  Starttid
                </Text>
                <Text variant="body" color="primary" style={{ fontWeight: '600' }}>
                  Kl. {formatTimeDa(startDate)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.muted}
              />
            </Pressable>

            {showStartDatePicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  setShowStartDatePicker(false);
                  if (d) {
                    const n = new Date(startDate);
                    n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setStartDate(n);
                  }
                }}
                minimumDate={new Date()}
              />
            )}
            {showStartTimePicker && (
              <DateTimePicker
                value={startDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, t) => {
                  setShowStartTimePicker(false);
                  if (t) {
                    const n = new Date(startDate);
                    n.setHours(t.getHours(), t.getMinutes());
                    setStartDate(n);
                  }
                }}
              />
            )}
          </Card>

          {/* Location */}
          <Card style={styles.formCard}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Sted
            </Text>

            <Text variant="body" color="primary" style={styles.label}>
              Stednavn
            </Text>
            <TextInput
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="F.eks. Farum Park"
              placeholderTextColor={theme.colors.text.muted}
            />

            <Text variant="body" color="primary" style={styles.label}>
              Adresse
            </Text>
            <TextInput
              style={styles.input}
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="F.eks. Pernille Højers Vej 1"
              placeholderTextColor={theme.colors.text.muted}
            />

            <View style={styles.rowFields}>
              <View style={styles.fieldHalf}>
                <Text variant="body" color="primary" style={styles.label}>
                  Postnr.
                </Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="3520"
                  placeholderTextColor={theme.colors.text.muted}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text variant="body" color="primary" style={styles.label}>
                  By
                </Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Farum"
                  placeholderTextColor={theme.colors.text.muted}
                />
              </View>
            </View>

            <Text variant="body" color="primary" style={styles.label}>
              Land
            </Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={country}
              onChangeText={setCountry}
              placeholderTextColor={theme.colors.text.muted}
            />
          </Card>
        </ScrollView>

        {/* Sticky footer: respekterer safeArea + tabBar højde.
          paddingBottom = max(insets.bottom, tabBarHeight) + spacing.
          Knappen er ALTID synlig og klikbar. */}
        <View
          style={[
            styles.stickyFooter,
            { paddingBottom: Math.max(insets.bottom, tabBarHeight) + theme.spacing[2] },
          ]}
        >
          <PrimaryButton
            title={saving ? 'Gemmer...' : 'Gem ændringer'}
            onPress={handleSave}
            disabled={saving || !title.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles ---

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
  scrollView: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.default,
  },
  formCard: {
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    marginBottom: theme.spacing[3],
    fontWeight: '700',
  },
  label: {
    fontWeight: '600',
    marginBottom: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  input: {
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.bg.card,
  },
  inputDisabled: {
    backgroundColor: theme.colors.bg.subtle,
    color: theme.colors.text.muted,
  },
  textArea: {
    minHeight: theme.spacing[16] + theme.spacing[10],
    paddingTop: theme.spacing[2],
  },
  rowFields: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  fieldHalf: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.layout.borderHairline,
    borderBottomColor: theme.colors.border.subtle,
  },
  dateIcon: {
    width: theme.spacing[9],
    height: theme.spacing[9],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.subtle,
    borderRadius: theme.radius.sm,
    marginRight: theme.spacing[3],
  },
  coverPicker: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.border.default,
    borderStyle: 'dashed',
    marginTop: theme.spacing[1],
  },
  coverPreview: {
    width: '100%',
    height: '100%',
  },
  coverPickerPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg.subtle,
    gap: theme.spacing[2],
  },
  coverPickerText: {
    marginTop: theme.spacing[1],
  },
  coverActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing[2],
  },
  coverActionLink: {
    fontWeight: '600',
  },
  coverRemoveLink: {
    fontWeight: '600',
    color: theme.colors.error,
  },
  stickyFooter: {
    backgroundColor: theme.colors.bg.default,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
});
