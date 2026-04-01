// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { Text } from '../components/ui';
import { Card } from '../components/ui/Card';
import { OutlineButton } from '../components/ui/OutlineButton';
import type { RootStackParamList } from '../navigation/types';
import {
  createFanActivity,
  resolveCreateFanActivityCommunity,
  type FanActivityCommunity,
  type ResolvedFanActivityCommunity,
} from '../services/fanActivities';
import { defaultTheme as theme } from '../theme';

type CreateFanActivityRouteProp = RouteProp<RootStackParamList, 'CreateFanActivity'>;
type FanActivityTypeValue = 'fanmarch' | 'bustur' | 'tifo' | 'fanbar' | 'andet';

type FanActivityTypeOption = {
  value: FanActivityTypeValue;
  label: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  titlePlaceholder: string;
  bodyPlaceholder: string;
};

const FAN_ACTIVITY_TYPE_OPTIONS: FanActivityTypeOption[] = [
  {
    value: 'fanmarch',
    label: 'Fanmarch',
    helper: 'Samling og march mod stadion',
    icon: 'walk-outline',
    titlePlaceholder: 'F.eks. March fra stationen',
    bodyPlaceholder: 'Skriv hvor I mødes, hvornår marchen går, og hvad folk skal vide.',
  },
  {
    value: 'bustur',
    label: 'Bustur',
    helper: 'Transport og afgang til kampen',
    icon: 'bus-outline',
    titlePlaceholder: 'F.eks. Afgang fra Farum',
    bodyPlaceholder: 'Skriv afgangstid, pladser og praktiske detaljer om turen.',
  },
  {
    value: 'tifo',
    label: 'Tifo',
    helper: 'Flag, sange og opsætning',
    icon: 'flag-outline',
    titlePlaceholder: 'F.eks. Tifo-opsætning før kamp',
    bodyPlaceholder: 'Skriv hvad der skal forberedes, og hvornår folk skal være klar.',
  },
  {
    value: 'fanbar',
    label: 'Fanbar',
    helper: 'Optakt og samlingssted',
    icon: 'beer-outline',
    titlePlaceholder: 'F.eks. Optakt på fanbaren',
    bodyPlaceholder: 'Skriv stemning, tidspunkt og hvad folk kan forvente.',
  },
  {
    value: 'andet',
    label: 'Andet',
    helper: 'Alt andet omkring kampdagen',
    icon: 'sparkles-outline',
    titlePlaceholder: 'F.eks. Samling før kickoff',
    bodyPlaceholder: 'Skriv kort hvad aktiviteten går ud på, og det vigtigste at vide.',
  },
];

function getDefaultStartDate(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function getDefaultEndDate(startDate: Date): Date {
  return new Date(startDate.getTime() + 60 * 60 * 1000);
}

function formatDateDa(date: Date): string {
  return date.toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function formatTimeDa(date: Date): string {
  return date.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function withUpdatedDate(baseDate: Date, selectedDate: Date): Date {
  const next = new Date(baseDate);
  next.setFullYear(selectedDate.getFullYear());
  next.setMonth(selectedDate.getMonth());
  next.setDate(selectedDate.getDate());
  return next;
}

function withUpdatedTime(baseDate: Date, selectedTime: Date): Date {
  const next = new Date(baseDate);
  next.setHours(selectedTime.getHours());
  next.setMinutes(selectedTime.getMinutes());
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

function getSenderHelperText(
  parentType: 'match' | 'event',
  resolutionSource: ResolvedFanActivityCommunity['source'],
): string {
  if (parentType === 'event') {
    return 'Afsenderen følger eventets community.';
  }

  if (resolutionSource === 'wild_tigers_default') {
    return 'Afsenderen sættes automatisk til Wild Tigers for kampdagsaktiviteter.';
  }

  if (resolutionSource === 'single_owned_fallback') {
    return 'Du ejer kun ét community, så det bruges automatisk i V1.';
  }

  return 'Afsenderen fastlægges automatisk fra kampkonteksten.';
}

export default function CreateFanActivityScreen() {
  const navigation = useNavigation();
  const route = useRoute<CreateFanActivityRouteProp>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { parentType, parentId, communityId: parentCommunityId } = route.params;

  const [type, setType] = useState<FanActivityTypeValue | ''>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [locationName, setLocationName] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [startsAt, setStartsAt] = useState<Date>(() => getDefaultStartDate());
  const [endsAt, setEndsAt] = useState<Date>(() => getDefaultEndDate(getDefaultStartDate()));
  const [hasEndAt, setHasEndAt] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [resolvedCommunity, setResolvedCommunity] = useState<FanActivityCommunity | null>(null);
  const [communityResolutionSource, setCommunityResolutionSource] =
    useState<ResolvedFanActivityCommunity['source']>('unresolved');
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [communityAccessError, setCommunityAccessError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parentLabel = parentType === 'match' ? 'kamp' : 'event';
  const parentPossessiveLabel = parentType === 'match' ? 'kampens' : 'eventets';
  const selectedTypeOption = useMemo(
    () => FAN_ACTIVITY_TYPE_OPTIONS.find((option) => option.value === type) ?? null,
    [type],
  );
  const senderHelperText = useMemo(() => {
    if (!resolvedCommunity) return null;
    return getSenderHelperText(parentType, communityResolutionSource);
  }, [communityResolutionSource, parentType, resolvedCommunity]);

  useEffect(() => {
    let isActive = true;

    const resolveCommunity = async () => {
      if (!user?.id) {
        if (isActive) {
          setResolvedCommunity(null);
          setCommunityResolutionSource('unresolved');
          setLoadingCommunity(false);
          setCommunityAccessError('Du skal være logget ind for at oprette fanaktiviteter.');
        }
        return;
      }

      setLoadingCommunity(true);
      setCommunityAccessError(null);

      const resolution = await resolveCreateFanActivityCommunity({
        userId: user.id,
        parentType,
        parentCommunityId: parentCommunityId ?? null,
      });

      if (!isActive) return;

      setResolvedCommunity(resolution.community);
      setCommunityResolutionSource(resolution.source);
      setCommunityAccessError(resolution.errorMessage);
      setLoadingCommunity(false);
    };

    void resolveCommunity();

    return () => {
      isActive = false;
    };
  }, [parentCommunityId, parentType, user?.id]);

  const handleStartDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    if (!selectedDate) return;

    setStartsAt((current) => {
      const nextStart = withUpdatedDate(current, selectedDate);
      if (hasEndAt && endsAt < nextStart) {
        setEndsAt(getDefaultEndDate(nextStart));
      }
      return nextStart;
    });
  };

  const handleStartTimeChange = (_event: unknown, selectedTime?: Date) => {
    setShowStartTimePicker(false);
    if (!selectedTime) return;

    setStartsAt((current) => {
      const nextStart = withUpdatedTime(current, selectedTime);
      if (hasEndAt && endsAt < nextStart) {
        setEndsAt(getDefaultEndDate(nextStart));
      }
      return nextStart;
    });
  };

  const handleEndDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (!selectedDate) return;

    setEndsAt((current) => withUpdatedDate(current, selectedDate));
  };

  const handleEndTimeChange = (_event: unknown, selectedTime?: Date) => {
    setShowEndTimePicker(false);
    if (!selectedTime) return;

    setEndsAt((current) => withUpdatedTime(current, selectedTime));
  };

  const handleToggleEndAt = () => {
    if (hasEndAt) {
      setHasEndAt(false);
      return;
    }

    setHasEndAt(true);
    setEndsAt((current) => (current < startsAt ? getDefaultEndDate(startsAt) : current));
  };

  const handleSubmit = async () => {
    if (!type.trim()) {
      Alert.alert('Fejl', 'Vælg en type for fanaktiviteten.');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Fejl', 'Titel er påkrævet.');
      return;
    }

    if (!resolvedCommunity?.id) {
      Alert.alert('Fejl', communityAccessError || 'Afsender kunne ikke fastlægges.');
      return;
    }

    if (hasEndAt && endsAt < startsAt) {
      Alert.alert('Fejl', 'Sluttid skal være efter starttid.');
      return;
    }

    setSubmitting(true);

    try {
      await createFanActivity({
        parentType,
        parentId,
        parentCommunityId: parentCommunityId ?? null,
        communityId: resolvedCommunity.id,
        type,
        title,
        body,
        startsAt: startsAt.toISOString(),
        endsAt: hasEndAt ? endsAt.toISOString() : null,
        locationName,
        ctaLabel,
        ctaUrl,
      });

      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Kunne ikke oprette fanaktiviteten.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons
            name="close"
            size={theme.components.icon.size.md}
            color={theme.colors.bg.card}
          />
        </Pressable>
        <Text variant="h3" color="inverse" style={styles.headerTitle}>
          Ny fanaktivitet
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + theme.spacing[6]}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <Text variant="caption" color="secondary" style={styles.eyebrow}>
              KNYTTET TIL {parentLabel.toUpperCase()}
            </Text>
            <Text variant="body" color="primary">
              Fanaktiviteten bliver vist på {parentPossessiveLabel} detaljeside, når den er oprettet.
            </Text>
          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Grundlæggende information
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Aktivitetstype
            </Text>

            <View style={styles.typeGrid}>
              {FAN_ACTIVITY_TYPE_OPTIONS.map((option) => {
                const isSelected = option.value === type;

                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [
                      styles.typeCard,
                      isSelected && styles.typeCardSelected,
                      pressed && styles.typeCardPressed,
                    ]}
                    onPress={() => setType(option.value)}
                  >
                    <View style={[styles.typeIconWrap, isSelected && styles.typeIconWrapSelected]}>
                      <Ionicons
                        name={option.icon}
                        size={theme.components.icon.size.sm}
                        color={isSelected ? theme.colors.primary : theme.colors.text.secondary}
                      />
                    </View>

                    <View style={styles.typeCardCopy}>
                      <Text
                        variant="body"
                        color="primary"
                        style={[styles.typeCardLabel, isSelected && styles.typeCardLabelSelected]}
                      >
                        {option.label}
                      </Text>
                      <Text
                        variant="caption"
                        color="secondary"
                        style={[styles.typeCardHelper, isSelected && styles.typeCardHelperSelected]}
                      >
                        {option.helper}
                      </Text>
                    </View>

                    <Ionicons
                      name={isSelected ? 'radio-button-on-outline' : 'radio-button-off-outline'}
                      size={theme.components.icon.size.sm}
                      color={isSelected ? theme.colors.primary : theme.colors.text.secondary}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Text variant="caption" color="secondary" style={styles.typeHelp}>
              Vælg den type, der passer bedst. Resten kan du uddybe i titel og beskrivelse.
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Titel
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={selectedTypeOption?.titlePlaceholder || 'F.eks. Optakt i Farum'}
              placeholderTextColor={theme.colors.text.muted}
            />

            <Text variant="caption" color="secondary" style={styles.label}>
              Beskrivelse
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={body}
              onChangeText={setBody}
              placeholder={
                selectedTypeOption?.bodyPlaceholder || 'Tilføj praktiske detaljer eller stemning...'
              }
              placeholderTextColor={theme.colors.text.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Dato og tid
            </Text>

            <Pressable style={styles.dateTimeRow} onPress={() => setShowStartDatePicker(true)}>
              <View style={styles.dateTimeIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.dateTimeCopy}>
                <Text variant="caption" color="secondary">
                  Startdato
                </Text>
                <Text variant="body" color="primary" style={styles.dateTimeValue}>
                  {formatDateDa(startsAt)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.secondary}
              />
            </Pressable>

            <Pressable style={styles.dateTimeRow} onPress={() => setShowStartTimePicker(true)}>
              <View style={styles.dateTimeIcon}>
                <Ionicons
                  name="time-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.dateTimeCopy}>
                <Text variant="caption" color="secondary">
                  Starttid
                </Text>
                <Text variant="body" color="primary" style={styles.dateTimeValue}>
                  Kl. {formatTimeDa(startsAt)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={theme.components.icon.size.sm}
                color={theme.colors.text.secondary}
              />
            </Pressable>

            <Pressable style={styles.inlineToggle} onPress={handleToggleEndAt}>
              <Ionicons
                name={hasEndAt ? 'remove-circle-outline' : 'add-circle-outline'}
                size={theme.components.icon.size.sm}
                color={theme.colors.primary}
              />
              <Text variant="body" color="primary" style={styles.inlineToggleText}>
                {hasEndAt ? 'Fjern sluttid' : 'Tilføj sluttid'}
              </Text>
            </Pressable>

            {hasEndAt ? (
              <View style={styles.endTimeBlock}>
                <Pressable style={styles.dateTimeRow} onPress={() => setShowEndDatePicker(true)}>
                  <View style={styles.dateTimeIcon}>
                    <Ionicons
                      name="calendar-clear-outline"
                      size={theme.components.icon.size.sm}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.dateTimeCopy}>
                    <Text variant="caption" color="secondary">
                      Slutdato
                    </Text>
                    <Text variant="body" color="primary" style={styles.dateTimeValue}>
                      {formatDateDa(endsAt)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={theme.components.icon.size.sm}
                    color={theme.colors.text.secondary}
                  />
                </Pressable>

                <Pressable style={styles.dateTimeRow} onPress={() => setShowEndTimePicker(true)}>
                  <View style={styles.dateTimeIcon}>
                    <Ionicons
                      name="time-outline"
                      size={theme.components.icon.size.sm}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.dateTimeCopy}>
                    <Text variant="caption" color="secondary">
                      Sluttid
                    </Text>
                    <Text variant="body" color="primary" style={styles.dateTimeValue}>
                      Kl. {formatTimeDa(endsAt)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={theme.components.icon.size.sm}
                    color={theme.colors.text.secondary}
                  />
                </Pressable>
              </View>
            ) : null}

            {showStartDatePicker ? (
              <DateTimePicker
                value={startsAt}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartDateChange}
                minimumDate={new Date()}
              />
            ) : null}

            {showStartTimePicker ? (
              <DateTimePicker
                value={startsAt}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartTimeChange}
              />
            ) : null}

            {showEndDatePicker ? (
              <DateTimePicker
                value={endsAt}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndDateChange}
                minimumDate={startsAt}
              />
            ) : null}

            {showEndTimePicker ? (
              <DateTimePicker
                value={endsAt}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndTimeChange}
              />
            ) : null}
          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Sted
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Sted
            </Text>
            <TextInput
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="F.eks. Caféen ved stadion"
              placeholderTextColor={theme.colors.text.muted}
            />

            <Text variant="caption" color="secondary" style={styles.label}>
              Knaptekst
            </Text>
            <TextInput
              style={styles.input}
              value={ctaLabel}
              onChangeText={setCtaLabel}
              placeholder="Valgfrit, f.eks. Book plads"
              placeholderTextColor={theme.colors.text.muted}
            />

            <Text variant="caption" color="secondary" style={styles.label}>
              Link
            </Text>
            <TextInput
              style={styles.input}
              value={ctaUrl}
              onChangeText={setCtaUrl}
              placeholder="Valgfrit, f.eks. https://wildtigers.dk"
              placeholderTextColor={theme.colors.text.muted}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text variant="caption" color="secondary" style={styles.helperText}>
              Valgfrit. Brug dem til booking, info eller stotte. Udfyld begge felter for at
              vise en knap i detaljevisningen.
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Afsender
            </Text>

            {loadingCommunity ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="caption" color="secondary">
                  Fastlægger afsender...
                </Text>
              </View>
            ) : null}

            {!loadingCommunity && communityAccessError ? (
              <Text variant="caption" color="secondary" style={styles.helperText}>
                {communityAccessError}
              </Text>
            ) : null}

            {!loadingCommunity && resolvedCommunity ? (
              <View style={styles.senderCard}>
                <View style={styles.senderCopy}>
                  <Text variant="body" color="primary" style={styles.senderName}>
                    {resolvedCommunity.name}
                  </Text>
                  {senderHelperText ? (
                    <Text variant="caption" color="secondary">
                      {senderHelperText}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={parentType === 'event' ? 'lock-closed-outline' : 'checkmark-circle-outline'}
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
            ) : null}
          </Card>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[4] }]}>
          <OutlineButton title="Annuller" onPress={() => navigation.goBack()} disabled={submitting} />
          <PrimaryButton
            title={submitting ? 'Opretter...' : 'Opret fanaktivitet'}
            onPress={handleSubmit}
            disabled={submitting || loadingCommunity || !resolvedCommunity || Boolean(communityAccessError)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
  },
  headerButton: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: theme.spacing[10],
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  card: {
    marginBottom: theme.spacing[3],
  },
  eyebrow: {
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    marginBottom: theme.spacing[3],
    fontWeight: '700',
  },
  label: {
    fontWeight: '700',
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase',
  },
  typeGrid: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
  },
  typeCardSelected: {
    backgroundColor: theme.colors.bg.subtle,
    borderColor: theme.colors.border.active,
  },
  typeCardPressed: {
    opacity: 0.94,
  },
  typeIconWrap: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconWrapSelected: {
    backgroundColor: theme.colors.ctaBg,
  },
  typeCardCopy: {
    flex: 1,
  },
  typeCardLabel: {
    fontWeight: '700',
    marginBottom: theme.spacing[1],
  },
  typeCardLabelSelected: {
    color: theme.colors.primary,
  },
  typeCardHelper: {
    lineHeight: theme.spacing[4],
  },
  typeCardHelperSelected: {
    color: theme.colors.text.secondary,
  },
  typeHelp: {
    marginBottom: theme.spacing[3],
    lineHeight: theme.spacing[4],
  },
  input: {
    minHeight: theme.spacing[12],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    color: theme.colors.text.primary,
    fontSize: theme.typography.body.fontSize,
    marginBottom: theme.spacing[3],
  },
  textArea: {
    minHeight: theme.spacing[16] + theme.spacing[12],
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
  },
  dateTimeIcon: {
    width: theme.spacing[9],
    height: theme.spacing[9],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[3],
  },
  dateTimeCopy: {
    flex: 1,
  },
  dateTimeValue: {
    fontWeight: '700',
    marginTop: theme.spacing[1],
  },
  inlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  inlineToggleText: {
    fontWeight: '600',
  },
  endTimeBlock: {
    marginTop: theme.spacing[2],
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  helperText: {
    marginBottom: theme.spacing[2],
  },
  senderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.subtle,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
  },
  senderCopy: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  senderName: {
    fontWeight: '700',
    marginBottom: theme.spacing[1],
  },
  footer: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    gap: theme.spacing[2],
    backgroundColor: theme.colors.bg.default,
  },
});
