import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { ActorSelector } from '../components/ActorSelector';
import { supabase } from '../lib/supabase';
import { buildAddressText, geocodeAddress } from '../services/geocoding';
import { defaultTheme as theme, spacing } from '../theme';
import { useFeed } from '../state/FeedContext';
import type { Actor } from '../types/news';
import { resolveProfileDisplayName } from '../utils/actor';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateEvent'>;

export default function CreateEventScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { profileMap } = useFeed();
  const styles = createStyles(theme);

  // Event basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');

  // Address fields (required for map)
  const [addressLine1, setAddressLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Danmark');

  // Date/time
  const [startTime, setStartTime] = useState(
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16),
  ); // yyyy-mm-ddThh:mm

  const [loading, setLoading] = useState(false);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  React.useEffect(() => {
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

  const handleCreate = async () => {
    // Validation
    if (!title.trim()) {
      Alert.alert('Fejl', 'Titel er påkrævet');
      return;
    }
    if (!addressLine1.trim() || !postalCode.trim() || !city.trim()) {
      Alert.alert('Fejl', 'Adresse, postnummer og by er påkrævet for at vise event på kortet');
      return;
    }

    const dt = new Date(startTime);
    if (isNaN(dt.getTime())) {
      Alert.alert('Ugyldigt tidspunkt', 'Brug format: 2025-12-18T15:00');
      return;
    }

    if (!selectedActor) {
      Alert.alert('Fejl', 'Vælg hvem du opretter som');
      return;
    }

    setLoading(true);

    try {
      // Build full address text
      const addressText = buildAddressText({
        address_line1: addressLine1,
        postal_code: postalCode,
        city,
        country,
      });

      // Geocode the address
      const geoResult = await geocodeAddress(addressText);
      if (!geoResult) {
        Alert.alert(
          'Kunne ikke finde adressen',
          'Tjek stavning af adresse, postnummer og by. Adressen skal være gyldig for at vise event på kortet.',
        );
        setLoading(false);
        return;
      }

      // Create event in Supabase
      const organizerType = selectedActor.type === 'community' ? 'community' : 'fan';
      const organizerId = selectedActor.id;

      const { data, error } = await supabase
        .from('events')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          start_at: dt.toISOString(),
          location_name: locationName.trim() || null,
          address_line1: addressLine1.trim(),
          postal_code: postalCode.trim(),
          city: city.trim(),
          country: country.trim(),
          address_text: addressText,
          lat: geoResult.lat,
          lng: geoResult.lng,
          place_name: geoResult.place_name,
          geocoded_at: new Date().toISOString(),
          created_by: user?.id ?? null,
          creator_user_id: user?.id ?? null,
          organizer_type: organizerType,
          organizer_id: organizerId,
          organizer_group_id: organizerType === 'community' ? organizerId : null,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[CreateEvent] Error creating event:', error);
        Alert.alert('Fejl', 'Kunne ikke oprette event');
        setLoading(false);
        return;
      }

      // Navigate to event details
      navigation.replace('EventDetails', { eventId: data.id });
    } catch (err: any) {
      console.error('[CreateEvent] Unexpected error:', err);
      Alert.alert('Fejl', err?.message ?? 'Ukendt fejl');
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Event Detaljer</Text>

      {selectedActor ? (
        <ActorSelector selectedActor={selectedActor} onSelectActor={setSelectedActor} />
      ) : null}

      <Text style={styles.label}>Titel *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Fx: Mødested før kampen"
      />

      <Text style={styles.label}>Beskrivelse</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Valgfri beskrivelse..."
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Stednavn</Text>
      <TextInput
        style={styles.input}
        value={locationName}
        onChangeText={setLocationName}
        placeholder="Fx: Farum Kro"
      />

      <Text style={styles.sectionTitle}>Adresse (påkrævet for kort)</Text>

      <Text style={styles.label}>Adresse *</Text>
      <TextInput
        style={styles.input}
        value={addressLine1}
        onChangeText={setAddressLine1}
        placeholder="Fx: Stavnsholtvej 77"
      />

      <View style={styles.row}>
        <View style={styles.halfColumn}>
          <Text style={styles.label}>Postnummer *</Text>
          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="3520"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.halfColumn}>
          <Text style={styles.label}>By *</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Farum" />
        </View>
      </View>

      <Text style={styles.label}>Land</Text>
      <TextInput style={styles.input} value={country} onChangeText={setCountry} />

      <Text style={styles.sectionTitle}>Tid</Text>

      <Text style={styles.label}>Starttid (yyyy-mm-ddThh:mm)</Text>
      <TextInput
        style={styles.input}
        value={startTime}
        onChangeText={setStartTime}
        autoCapitalize="none"
        placeholder="2025-12-18T15:00"
      />

      <View style={{ height: spacing.lg }} />

      <PrimaryButton
        title={loading ? 'Opretter...' : 'Opret Event'}
        onPress={handleCreate}
        disabled={loading}
      />

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Geocoder adresse...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: typeof import('../theme').defaultTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    contentContainer: {
      padding: theme.spacing[4],
      paddingBottom: theme.spacing[8],
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginTop: theme.spacing[6],
      marginBottom: theme.spacing[2],
    },
    label: {
      marginTop: theme.spacing[2],
      marginBottom: theme.spacing[1],
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      padding: theme.spacing[2],
      fontSize: 16,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.bg.elevated,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing[2],
    },
    halfColumn: {
      flex: 1,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacing[4],
      gap: theme.spacing[2],
    },
    loadingText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
    },
  });
