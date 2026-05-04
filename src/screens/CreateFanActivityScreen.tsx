// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type GestureResponderEvent,
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
  fetchManageableFanActivityCommunities,
  fetchFanActivityById,
  resolveCreateFanActivityCommunity,
  updateFanActivity,
  type FanActivity,
  type FanActivityCommunity,
  type ResolvedFanActivityCommunity,
} from '../services/fanActivities';
import { defaultTheme as theme } from '../theme';

type CreateFanActivityRouteProp = RouteProp<RootStackParamList, 'CreateFanActivity'>;
type FanActivityTypeValue = 'fanmarch' | 'bustur' | 'tifo' | 'fanbar' | 'andet';
type DateTimePickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime';
type ActiveDateTimePicker = {
  target: DateTimePickerTarget;
  mode: 'date' | 'time';
};

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
  isCommunityLocked: boolean,
): string | null {
  if (parentType === 'event') {
    return 'Arrangør følger eventets community.';
  }

  if (isCommunityLocked) {
    return 'Arrangør er låst på aktiviteten.';
  }

  if (resolutionSource === 'explicit_selection') {
    return 'Vælg den fanfraktion, der skal stå som arrangør.';
  }

  return null;
}

export default function CreateFanActivityScreen() {
  const navigation = useNavigation();
  const route = useRoute<CreateFanActivityRouteProp>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    parentType,
    parentId,
    communityId: parentCommunityId,
    lockCommunity = false,
    fanActivityId,
  } = route.params;

  const isEditMode = Boolean(fanActivityId?.trim());
  const isCommunityLocked = isEditMode || lockCommunity || parentType === 'event';

  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const capacityRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const instructionsRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);
  const ctaLabelRef = useRef<TextInput>(null);
  const ctaUrlRef = useRef<TextInput>(null);
  const dateTimePressStartRef = useRef<{ pageX: number; pageY: number } | null>(null);
  const didDragDateTimeRowRef = useRef(false);

  const [type, setType] = useState<FanActivityTypeValue | ''>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [locationName, setLocationName] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [registrationCapacity, setRegistrationCapacity] = useState('');
  const [registrationPriceDkk, setRegistrationPriceDkk] = useState('');
  const [registrationPaymentInstructions, setRegistrationPaymentInstructions] = useState('');
  const [startsAt, setStartsAt] = useState<Date>(() => getDefaultStartDate());
  const [endsAt, setEndsAt] = useState<Date>(() => getDefaultEndDate(getDefaultStartDate()));
  const [hasEndAt, setHasEndAt] = useState(false);
  const [activeDateTimePicker, setActiveDateTimePicker] = useState<ActiveDateTimePicker | null>(
    null,
  );
  const [pendingDateTimeValue, setPendingDateTimeValue] = useState<Date | null>(null);
  const [availableCommunities, setAvailableCommunities] = useState<FanActivityCommunity[]>([]);
  const [resolvedCommunity, setResolvedCommunity] = useState<FanActivityCommunity | null>(null);
  const [communityResolutionSource, setCommunityResolutionSource] =
    useState<ResolvedFanActivityCommunity['source']>('unresolved');
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [communityAccessError, setCommunityAccessError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedActivity, setLoadedActivity] = useState<FanActivity | null>(null);

  const parentLabel = parentType === 'match' ? 'kamp' : 'event';
  const parentPossessiveLabel = parentType === 'match' ? 'kampens' : 'eventets';
  const screenTitle = isEditMode ? 'Redigér fanaktivitet' : 'Ny fanaktivitet';
  const submitLabel = submitting
    ? isEditMode
      ? 'Gemmer...'
      : 'Opretter...'
    : isEditMode
      ? 'Gem ændringer'
      : 'Opret fanaktivitet';
  const selectedTypeOption = useMemo(
    () => FAN_ACTIVITY_TYPE_OPTIONS.find((option) => option.value === type) ?? null,
    [type],
  );
  const parsedRegistrationCapacity = useMemo(
    () => Math.max(0, Math.trunc(Number(registrationCapacity ?? 0) || 0)),
    [registrationCapacity],
  );
  const parsedRegistrationPrice = useMemo(
    () => Math.max(0, Math.trunc(Number(registrationPriceDkk ?? 0) || 0)),
    [registrationPriceDkk],
  );
  const isPaidRegistration = registrationEnabled && parsedRegistrationPrice > 0;
  const communityMobilepayInfo = resolvedCommunity?.mobilepay_info?.trim() || null;
  const communityPaymentInstructions = resolvedCommunity?.mobilepay_instructions?.trim() || null;
  const senderHelperText = useMemo(() => {
    if (!resolvedCommunity) return null;
    return getSenderHelperText(parentType, communityResolutionSource, isCommunityLocked);
  }, [communityResolutionSource, isCommunityLocked, parentType, resolvedCommunity]);

  const focusField = (ref: React.RefObject<TextInput | null>) => {
    ref.current?.focus();
  };

  useEffect(() => {
    let isActive = true;

    const hydrateEditActivity = async () => {
      if (!isEditMode || !fanActivityId) {
        return;
      }

      setLoadingCommunity(true);
      setCommunityAccessError(null);

      const existingActivity = await fetchFanActivityById(fanActivityId);
      if (!isActive) return;

      if (!existingActivity) {
        setLoadedActivity(null);
        setResolvedCommunity(null);
        setCommunityResolutionSource('unresolved');
        setCommunityAccessError('Kunne ikke finde fanaktiviteten, der skal redigeres.');
        setLoadingCommunity(false);
        return;
      }

      const nextStart = new Date(existingActivity.starts_at);
      const nextEnd = existingActivity.ends_at ? new Date(existingActivity.ends_at) : null;

      setLoadedActivity(existingActivity);
      setType((existingActivity.type as FanActivityTypeValue) || 'andet');
      setTitle(existingActivity.title ?? '');
      setBody(existingActivity.body ?? '');
      setLocationName(existingActivity.location_name ?? '');
      setCtaLabel(existingActivity.cta_label ?? '');
      setCtaUrl(existingActivity.cta_url ?? '');
      setRegistrationEnabled(existingActivity.registration_enabled);
      setRegistrationCapacity(
        existingActivity.registration_capacity != null
          ? String(existingActivity.registration_capacity)
          : '',
      );
      setRegistrationPriceDkk(String(existingActivity.registration_price_dkk ?? 0));
      setRegistrationPaymentInstructions(existingActivity.registration_payment_instructions ?? '');
      setStartsAt(Number.isNaN(nextStart.getTime()) ? getDefaultStartDate() : nextStart);
      if (nextEnd && !Number.isNaN(nextEnd.getTime())) {
        setHasEndAt(true);
        setEndsAt(nextEnd);
      } else {
        setHasEndAt(false);
        setEndsAt(getDefaultEndDate(nextStart));
      }
      setResolvedCommunity(existingActivity.community ?? null);
      setCommunityResolutionSource('existing_activity');
      setLoadingCommunity(false);
    };

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

      if (isEditMode) {
        if (isActive) {
          setLoadingCommunity(false);
        }
        return;
      }

      setLoadingCommunity(true);
      setCommunityAccessError(null);

      if (!isCommunityLocked && parentType === 'match') {
        const manageableCommunities = await fetchManageableFanActivityCommunities(user.id, {
          communityType: 'fan_faction',
        });

        if (!isActive) return;

        setAvailableCommunities(manageableCommunities);

        const preselected =
          parentCommunityId?.trim() &&
          manageableCommunities.find((community) => community.id === parentCommunityId.trim());

        if (preselected) {
          setResolvedCommunity(preselected);
          setCommunityResolutionSource('explicit_selection');
          setCommunityAccessError(null);
        } else if (manageableCommunities.length === 1) {
          setResolvedCommunity(manageableCommunities[0]);
          setCommunityResolutionSource('explicit_selection');
          setCommunityAccessError(null);
        } else {
          setResolvedCommunity(null);
          setCommunityResolutionSource('unresolved');
          setCommunityAccessError(
            manageableCommunities.length === 0
              ? 'Du skal være owner eller admin i en fanfraktion for at oprette kampaktiviteter.'
              : null,
          );
        }

        setLoadingCommunity(false);
        return;
      }

      const resolution = await resolveCreateFanActivityCommunity({
        userId: user.id,
        parentType,
        parentCommunityId: parentCommunityId ?? null,
      });

      if (!isActive) return;

      setAvailableCommunities([]);
      setResolvedCommunity(resolution.community);
      setCommunityResolutionSource(resolution.source);
      setCommunityAccessError(resolution.errorMessage);
      setLoadingCommunity(false);
    };

    void hydrateEditActivity();
    void resolveCommunity();

    return () => {
      isActive = false;
    };
  }, [fanActivityId, isEditMode, parentCommunityId, parentType, user?.id]);

  useEffect(() => {
    if (!registrationEnabled || !isPaidRegistration) {
      return;
    }

    if (!registrationPaymentInstructions.trim() && communityPaymentInstructions) {
      setRegistrationPaymentInstructions(communityPaymentInstructions);
    }
  }, [
    communityPaymentInstructions,
    isPaidRegistration,
    registrationEnabled,
    registrationPaymentInstructions,
  ]);

  const getDateTimePickerValue = (target: DateTimePickerTarget): Date =>
    target === 'startDate' || target === 'startTime' ? startsAt : endsAt;

  const getDateTimePickerTitle = (target: DateTimePickerTarget): string => {
    switch (target) {
      case 'startDate':
        return 'Vælg startdato';
      case 'startTime':
        return 'Vælg starttid';
      case 'endDate':
        return 'Vælg slutdato';
      case 'endTime':
        return 'Vælg sluttid';
    }
  };

  const getDateTimePickerMinimumDate = (target: DateTimePickerTarget): Date | undefined => {
    if (target === 'startDate') return new Date();
    if (target === 'endDate') return startsAt;
    return undefined;
  };

  const applyDateTimePickerValue = (target: DateTimePickerTarget, selectedDate: Date) => {
    if (target === 'startDate') {
      setStartsAt((current) => {
        const nextStart = withUpdatedDate(current, selectedDate);
        if (hasEndAt && endsAt < nextStart) {
          setEndsAt(getDefaultEndDate(nextStart));
        }
        return nextStart;
      });
      return;
    }

    if (target === 'startTime') {
      setStartsAt((current) => {
        const nextStart = withUpdatedTime(current, selectedDate);
        if (hasEndAt && endsAt < nextStart) {
          setEndsAt(getDefaultEndDate(nextStart));
        }
        return nextStart;
      });
      return;
    }

    if (target === 'endDate') {
      setEndsAt((current) => withUpdatedDate(current, selectedDate));
      return;
    }

    setEndsAt((current) => withUpdatedTime(current, selectedDate));
  };

  const closeDateTimePicker = () => {
    setActiveDateTimePicker(null);
    setPendingDateTimeValue(null);
  };

  const handleDateTimePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!activeDateTimePicker) return;

    if (Platform.OS === 'android') {
      const picker = activeDateTimePicker;
      closeDateTimePicker();
      if (event.type === 'set' && selectedDate) {
        applyDateTimePickerValue(picker.target, selectedDate);
      }
      return;
    }

    if (event.type === 'set' && selectedDate) {
      setPendingDateTimeValue(selectedDate);
    }
  };

  const handleConfirmDateTimePicker = () => {
    if (activeDateTimePicker && pendingDateTimeValue) {
      applyDateTimePickerValue(activeDateTimePicker.target, pendingDateTimeValue);
    }
    closeDateTimePicker();
  };

  const handleDateTimePressIn = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    dateTimePressStartRef.current = { pageX, pageY };
    didDragDateTimeRowRef.current = false;
  };

  const handleDateTimePressMove = (event: GestureResponderEvent) => {
    const start = dateTimePressStartRef.current;
    if (!start) return;

    const { pageX, pageY } = event.nativeEvent;
    if (Math.hypot(pageX - start.pageX, pageY - start.pageY) > theme.spacing[2]) {
      didDragDateTimeRowRef.current = true;
    }
  };

  const handleOpenDateTimePicker = (target: DateTimePickerTarget) => {
    if (didDragDateTimeRowRef.current) {
      dateTimePressStartRef.current = null;
      didDragDateTimeRowRef.current = false;
      return;
    }

    Keyboard.dismiss();
    setPendingDateTimeValue(getDateTimePickerValue(target));
    setActiveDateTimePicker({
      target,
      mode: target === 'startDate' || target === 'endDate' ? 'date' : 'time',
    });
    dateTimePressStartRef.current = null;
  };

  const handleToggleEndAt = () => {
    if (didDragDateTimeRowRef.current) {
      dateTimePressStartRef.current = null;
      didDragDateTimeRowRef.current = false;
      return;
    }

    if (hasEndAt) {
      setHasEndAt(false);
      return;
    }

    setHasEndAt(true);
    setEndsAt((current) => (current < startsAt ? getDefaultEndDate(startsAt) : current));
  };

  const handleSelectCommunity = (community: FanActivityCommunity) => {
    setResolvedCommunity(community);
    setCommunityResolutionSource('explicit_selection');
    setCommunityAccessError(null);
  };

  const missingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!type.trim()) reasons.push('Vælg aktivitetstype');
    if (!title.trim()) reasons.push('Udfyld titel');
    if (!resolvedCommunity?.id) reasons.push('Vælg arrangør');
    if (registrationEnabled && !parsedRegistrationCapacity) reasons.push('Angiv kapacitet');
    if (isPaidRegistration && !communityMobilepayInfo) reasons.push('Mangler MobilePay på arrangør');
    if (hasEndAt && endsAt < startsAt) reasons.push('Sluttid skal være efter starttid');
    return reasons;
  }, [
    communityMobilepayInfo,
    endsAt,
    hasEndAt,
    isPaidRegistration,
    parsedRegistrationCapacity,
    registrationEnabled,
    resolvedCommunity,
    startsAt,
    title,
    type,
  ]);

  const isSubmitDisabled =
    submitting ||
    loadingCommunity ||
    Boolean(communityAccessError) ||
    (isEditMode && !loadedActivity) ||
    missingReasons.length > 0;

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
      Alert.alert('Fejl', communityAccessError || 'Arrangør kunne ikke fastlægges.');
      return;
    }

    if (registrationEnabled && !parsedRegistrationCapacity) {
      Alert.alert('Fejl', 'Kapacitet er påkrævet, når tilmelding er slået til.');
      return;
    }

    if (isPaidRegistration && !communityMobilepayInfo) {
      Alert.alert('Fejl', 'Arrangøren mangler MobilePay-info.');
      return;
    }

    if (hasEndAt && endsAt < startsAt) {
      Alert.alert('Fejl', 'Sluttid skal være efter starttid.');
      return;
    }

    setSubmitting(true);

    try {
      const effectiveMobilepayInfo = isPaidRegistration ? communityMobilepayInfo : null;
      const effectiveInstructions =
        registrationPaymentInstructions.trim() || communityPaymentInstructions || null;

      if (isEditMode && fanActivityId) {
        await updateFanActivity({
          fanActivityId,
          type,
          title,
          body,
          startsAt: startsAt.toISOString(),
          endsAt: hasEndAt ? endsAt.toISOString() : null,
          locationName,
          ctaLabel,
          ctaUrl,
          registrationEnabled,
          registrationCapacity: parsedRegistrationCapacity || null,
          registrationPriceDkk: parsedRegistrationPrice || 0,
          registrationPaymentInstructions: effectiveInstructions,
          registrationMobilepayInfo: effectiveMobilepayInfo,
        });
      } else {
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
          registrationEnabled,
          registrationCapacity: parsedRegistrationCapacity || null,
          registrationPriceDkk: parsedRegistrationPrice || 0,
          registrationPaymentInstructions: effectiveInstructions,
          registrationMobilepayInfo: effectiveMobilepayInfo,
        });
      }

      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        'Fejl',
        error?.message || `Kunne ikke ${isEditMode ? 'opdatere' : 'oprette'} fanaktiviteten.`,
      );
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
          {screenTitle}
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
          keyboardDismissMode="on-drag"
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
              Vælg typen først, uddybes i titel og beskrivelse.
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Titel
            </Text>
            <TextInput
              ref={titleRef}
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={selectedTypeOption?.titlePlaceholder || 'F.eks. Optakt i Farum'}
              placeholderTextColor={theme.colors.text.muted}
              returnKeyType="next"
              onSubmitEditing={() => focusField(bodyRef)}
            />

            <Text variant="caption" color="secondary" style={styles.label}>
              Beskrivelse
            </Text>
            <TextInput
              ref={bodyRef}
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
              blurOnSubmit
              returnKeyType="next"
              onSubmitEditing={() => {
                if (registrationEnabled) {
                  focusField(capacityRef);
                } else {
                  focusField(locationRef);
                }
              }}
            />
          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Dato og tid
            </Text>

            <Pressable
              style={styles.dateTimeRow}
              onPressIn={handleDateTimePressIn}
              onTouchMove={handleDateTimePressMove}
              onPress={() => handleOpenDateTimePicker('startDate')}
            >
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

            <Pressable
              style={styles.dateTimeRow}
              onPressIn={handleDateTimePressIn}
              onTouchMove={handleDateTimePressMove}
              onPress={() => handleOpenDateTimePicker('startTime')}
            >
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

            <Pressable
              style={styles.inlineToggle}
              onPressIn={handleDateTimePressIn}
              onTouchMove={handleDateTimePressMove}
              onPress={handleToggleEndAt}
            >
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
                <Pressable
                  style={styles.dateTimeRow}
                  onPressIn={handleDateTimePressIn}
                  onTouchMove={handleDateTimePressMove}
                  onPress={() => handleOpenDateTimePicker('endDate')}
                >
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

                <Pressable
                  style={styles.dateTimeRow}
                  onPressIn={handleDateTimePressIn}
                  onTouchMove={handleDateTimePressMove}
                  onPress={() => handleOpenDateTimePicker('endTime')}
                >
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

          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Sted
            </Text>

            <Text variant="caption" color="secondary" style={styles.label}>
              Sted
            </Text>
            <TextInput
              ref={locationRef}
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="F.eks. Caféen ved stadion"
              placeholderTextColor={theme.colors.text.muted}
              returnKeyType="next"
              onSubmitEditing={() => focusField(ctaLabelRef)}
            />

            {!registrationEnabled ? (
              <>
                <Text variant="caption" color="secondary" style={styles.label}>
                  Knaptekst
                </Text>
                <TextInput
                  ref={ctaLabelRef}
                  style={styles.input}
                  value={ctaLabel}
                  onChangeText={setCtaLabel}
                  placeholder="Valgfrit, f.eks. Book plads"
                  placeholderTextColor={theme.colors.text.muted}
                  returnKeyType="next"
                  onSubmitEditing={() => focusField(ctaUrlRef)}
                />

                <Text variant="caption" color="secondary" style={styles.label}>
                  Link
                </Text>
                <TextInput
                  ref={ctaUrlRef}
                  style={styles.input}
                  value={ctaUrl}
                  onChangeText={setCtaUrl}
                  placeholder="Valgfrit, f.eks. https://fcnordsjaelland.dk"
                  placeholderTextColor={theme.colors.text.muted}
                  autoCapitalize="none"
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <Text variant="caption" color="secondary" style={styles.helperText}>
                  Valgfrit. Brug dem til booking eller ekstra info. Udfyld begge felter for at vise
                  en knap i detaljevisningen.
                </Text>
              </>
            ) : null}

            <Text variant="caption" color="secondary" style={styles.label}>
              Arrangør
            </Text>

            {loadingCommunity ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="caption" color="secondary">
                  Finder arrangør...
                </Text>
              </View>
            ) : null}

            {!loadingCommunity && communityAccessError ? (
              <Text variant="caption" color="secondary" style={styles.helperText}>
                {communityAccessError}
              </Text>
            ) : null}

            {!loadingCommunity && !isCommunityLocked ? (
              <View style={styles.senderOptions}>
                {availableCommunities.length === 0 ? (
                  <Text variant="caption" color="secondary" style={styles.helperText}>
                    Ingen fanfraktioner tilgængelige for din konto.
                  </Text>
                ) : null}
                {availableCommunities.map((community) => {
                  const isSelected = community.id === resolvedCommunity?.id;

                  return (
                    <Pressable
                      key={community.id}
                      style={({ pressed }) => [
                        styles.senderOptionCard,
                        isSelected && styles.senderOptionCardSelected,
                        pressed && styles.typeCardPressed,
                      ]}
                      onPress={() => handleSelectCommunity(community)}
                    >
                      <View style={styles.senderCopy}>
                        <Text
                          variant="body"
                          color="primary"
                          style={[styles.senderName, isSelected && styles.senderNameSelected]}
                        >
                          {community.name}
                        </Text>
                        <Text variant="caption" color="secondary">
                          Fanfraktion
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle-outline' : 'ellipse-outline'}
                        size={theme.components.icon.size.sm}
                        color={isSelected ? theme.colors.primary : theme.colors.text.secondary}
                      />
                    </Pressable>
                  );
                })}
                {senderHelperText ? (
                  <Text variant="caption" color="secondary" style={styles.helperText}>
                    {senderHelperText}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {!loadingCommunity && isCommunityLocked && resolvedCommunity ? (
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
                  name="lock-closed-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.primary}
                />
              </View>
            ) : null}
          </Card>

          <Card style={styles.card}>
            <Text variant="h3" color="primary" style={styles.sectionTitle}>
              Tilmelding
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.settingCard,
                registrationEnabled && styles.settingCardSelected,
                pressed && styles.typeCardPressed,
              ]}
              onPress={() => setRegistrationEnabled((current) => !current)}
            >
              <View style={styles.settingCopy}>
                <Text variant="body" color="primary" style={styles.settingTitle}>
                  Kræver tilmelding
                </Text>
                <Text variant="caption" color="secondary" style={styles.settingBody}>
                  Slå til hvis der er pladser eller betaling.
                </Text>
              </View>
              <Ionicons
                name={registrationEnabled ? 'checkmark-circle-outline' : 'ellipse-outline'}
                size={theme.components.icon.size.sm}
                color={registrationEnabled ? theme.colors.primary : theme.colors.text.secondary}
              />
            </Pressable>

            {registrationEnabled ? (
              <>
                <View style={styles.splitRow}>
                  <View style={styles.splitField}>
                    <Text variant="caption" color="secondary" style={styles.label}>
                      Kapacitet
                    </Text>
                    <TextInput
                      ref={capacityRef}
                      style={[styles.input, styles.compactInput]}
                      value={registrationCapacity}
                      onChangeText={setRegistrationCapacity}
                      placeholder="F.eks. 50"
                      placeholderTextColor={theme.colors.text.muted}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(priceRef)}
                    />
                  </View>

                  <View style={styles.splitField}>
                    <Text variant="caption" color="secondary" style={styles.label}>
                      Pris (kr)
                    </Text>
                    <TextInput
                      ref={priceRef}
                      style={[styles.input, styles.compactInput]}
                      value={registrationPriceDkk}
                      onChangeText={setRegistrationPriceDkk}
                      placeholder="0 for gratis"
                      placeholderTextColor={theme.colors.text.muted}
                      keyboardType="number-pad"
                      returnKeyType={isPaidRegistration ? 'next' : 'done'}
                      onSubmitEditing={() => {
                        if (isPaidRegistration) {
                          focusField(instructionsRef);
                        } else {
                          focusField(locationRef);
                        }
                      }}
                    />
                  </View>
                </View>

                {isPaidRegistration ? (
                  <>
                    <Text variant="caption" color="secondary" style={styles.label}>
                      MobilePay
                    </Text>
                    <View style={styles.readonlyField}>
                      <Text variant="body" color="primary" style={styles.readonlyValue}>
                        {communityMobilepayInfo || 'Mangler MobilePay-info på arrangør'}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {resolvedCommunity?.name ? `Arrangør: ${resolvedCommunity.name}` : 'Arrangør'}
                      </Text>
                    </View>

                    <Text variant="caption" color="secondary" style={styles.label}>
                      Betalingsinfo (valgfri)
                    </Text>
                    <TextInput
                      ref={instructionsRef}
                      style={[styles.input, styles.instructionsInput]}
                      value={registrationPaymentInstructions}
                      onChangeText={setRegistrationPaymentInstructions}
                      placeholder="Kort besked til deltagerne om betaling."
                      placeholderTextColor={theme.colors.text.muted}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      blurOnSubmit
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(locationRef)}
                    />
                    <Text variant="caption" color="secondary" style={styles.helperText}>
                      Reference til betaling genereres automatisk ved tilmelding.
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}
          </Card>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing[4] }]}>
          {missingReasons.length > 0 ? (
            <Text variant="caption" color="secondary" style={styles.helperText}>
              Mangler: {missingReasons.join(' · ')}
            </Text>
          ) : null}
          <OutlineButton title="Annuller" onPress={() => navigation.goBack()} disabled={submitting} />
          <PrimaryButton
            title={submitLabel}
            onPress={handleSubmit}
            disabled={isSubmitDisabled}
          />
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === 'android' && activeDateTimePicker ? (
        <DateTimePicker
          value={pendingDateTimeValue ?? getDateTimePickerValue(activeDateTimePicker.target)}
          mode={activeDateTimePicker.mode}
          display="default"
          onChange={handleDateTimePickerChange}
          minimumDate={getDateTimePickerMinimumDate(activeDateTimePicker.target)}
          positiveButton={{ label: 'OK' }}
          negativeButton={{ label: 'Annuller' }}
          is24Hour
        />
      ) : null}

      {Platform.OS === 'ios' && activeDateTimePicker ? (
        <Modal visible transparent animationType="slide" onRequestClose={closeDateTimePicker}>
          <View style={styles.dateTimePickerOverlay}>
            <Pressable style={styles.dateTimePickerBackdrop} onPress={closeDateTimePicker} />

            <View
              style={[
                styles.dateTimePickerSheet,
                { paddingBottom: insets.bottom + theme.spacing[4] },
              ]}
            >
              <View style={styles.dateTimePickerHandle} />
              <View style={styles.dateTimePickerHeader}>
                <Text variant="h3" color="primary" style={styles.dateTimePickerTitle}>
                  {getDateTimePickerTitle(activeDateTimePicker.target)}
                </Text>
                <Pressable style={styles.dateTimePickerCloseButton} onPress={closeDateTimePicker}>
                  <Ionicons
                    name="close"
                    size={theme.components.icon.size.sm}
                    color={theme.colors.text.secondary}
                  />
                </Pressable>
              </View>

              <DateTimePicker
                value={pendingDateTimeValue ?? getDateTimePickerValue(activeDateTimePicker.target)}
                mode={activeDateTimePicker.mode}
                display="spinner"
                onChange={handleDateTimePickerChange}
                minimumDate={getDateTimePickerMinimumDate(activeDateTimePicker.target)}
                is24Hour
              />

              <View style={styles.dateTimePickerActions}>
                <OutlineButton title="Annuller" onPress={closeDateTimePicker} />
                <PrimaryButton title="OK" onPress={handleConfirmDateTimePicker} />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
  compactInput: {
    minHeight: theme.spacing[11],
  },
  textArea: {
    minHeight: theme.spacing[16] + theme.spacing[12],
  },
  instructionsInput: {
    minHeight: theme.spacing[16],
  },
  readonlyField: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.subtle,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    marginBottom: theme.spacing[3],
  },
  readonlyValue: {
    fontWeight: '700',
    marginBottom: theme.spacing[1],
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
  dateTimePickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay.medium,
  },
  dateTimePickerBackdrop: {
    flex: 1,
  },
  dateTimePickerSheet: {
    backgroundColor: theme.colors.bg.card,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    gap: theme.spacing[3],
  },
  dateTimePickerHandle: {
    alignSelf: 'center',
    width: theme.spacing[10],
    height: theme.spacing[1],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border.default,
  },
  dateTimePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
  },
  dateTimePickerTitle: {
    flex: 1,
    fontWeight: '700',
  },
  dateTimePickerCloseButton: {
    width: theme.spacing[9],
    height: theme.spacing[9],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTimePickerActions: {
    gap: theme.spacing[2],
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
  senderNameSelected: {
    color: theme.colors.primary,
  },
  senderOptions: {
    gap: theme.spacing[2],
  },
  senderOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
  },
  senderOptionCardSelected: {
    backgroundColor: theme.colors.bg.subtle,
    borderColor: theme.colors.border.active,
  },
  splitRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  splitField: {
    flex: 1,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    marginBottom: theme.spacing[2],
  },
  settingCardSelected: {
    backgroundColor: theme.colors.bg.subtle,
    borderColor: theme.colors.border.active,
  },
  settingCopy: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  settingTitle: {
    fontWeight: '700',
    marginBottom: theme.spacing[1],
  },
  settingBody: {
    lineHeight: theme.spacing[4],
  },
  footer: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    gap: theme.spacing[2],
    backgroundColor: theme.colors.bg.default,
  },
});
