import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { fetchEventById, type Event } from '../services/eventsApi';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme';

type EditEventRouteProp = RouteProp<{ EditEvent: { eventId: string } }, 'EditEvent'>;

export default function EditEventScreen() {
  const navigation = useNavigation();
  const route = useRoute<EditEventRouteProp>();
  const { eventId } = route.params;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

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
      setLocationAddress(data.location_address || '');
      setStartAt(data.start_at);
      setEndAt(data.end_at || '');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Titel er påkrævet');
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<Event> = {
        title: title.trim(),
        description: description.trim() || null,
        location_name: locationName.trim() || null,
        location_address: locationAddress.trim() || null,
        start_at: startAt,
        end_at: endAt || null,
      };

      const { error } = await supabase.from('events').update(updates).eq('id', eventId);

      if (error) {
        throw error;
      }

      Alert.alert('Gemt', 'Eventet er blevet opdateret', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('[EditEventScreen] Save error:', error);
      Alert.alert(
        'Fejl',
        error.message || 'Kunne ikke gemme ændringer. Du har muligvis ikke rettigheder til dette.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Redigér event</Text>
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
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Redigér event</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Kunne ikke finde eventet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Redigér event</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            Titel <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="F.eks. Pre-match møde"
            placeholderTextColor={colors.subtext}
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Beskriv eventet..."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Location Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Sted</Text>
          <TextInput
            style={styles.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="F.eks. Farum Park"
            placeholderTextColor={colors.subtext}
          />
        </View>

        {/* Location Address */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Adresse</Text>
          <TextInput
            style={styles.input}
            value={locationAddress}
            onChangeText={setLocationAddress}
            placeholder="F.eks. Stadionalle 1, 3520 Farum"
            placeholderTextColor={colors.subtext}
          />
        </View>

        {/* Start Date/Time */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>
            Start tidspunkt <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="ISO format: 2026-01-22T18:00:00"
            placeholderTextColor={colors.subtext}
          />
          <Text style={styles.helperText}>Format: YYYY-MM-DDTHH:mm:ss</Text>
        </View>

        {/* End Date/Time */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Slut tidspunkt (valgfrit)</Text>
          <TextInput
            style={styles.input}
            value={endAt}
            onChangeText={setEndAt}
            placeholder="ISO format: 2026-01-22T20:00:00"
            placeholderTextColor={colors.subtext}
          />
          <Text style={styles.helperText}>Format: YYYY-MM-DDTHH:mm:ss</Text>
        </View>

        {/* Save Button */}
        <View style={styles.buttonContainer}>
          <PrimaryButton
            title={saving ? 'Gemmer...' : 'Gem ændringer'}
            onPress={handleSave}
            disabled={saving || !title.trim()}
          />
        </View>
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
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
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
  errorText: {
    fontSize: 16,
    color: colors.text,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.sm,
  },
  helperText: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: spacing.xs,
  },
  buttonContainer: {
    marginTop: spacing.md,
  },
});
