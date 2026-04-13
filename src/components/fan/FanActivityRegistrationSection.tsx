import React, { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  StyleSheet,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { useCommunityRole } from '../../hooks/useCommunityRole';
import {
  adminUpdateFanActivityRegistrationStatus,
  createFanActivityRegistration,
  fetchFanActivityAdminRegistrations,
  fetchFanActivityRegistrationSummaries,
  fetchMyFanActivityRegistration,
  getEmptyFanActivityRegistrationSummary,
  markFanActivityRegistrationPaid,
  type FanActivityRegistration,
  type FanActivityRegistrationAdminEntry,
  type FanActivityRegistrationStatus,
  type FanActivityRegistrationSummary,
} from '../../services/fanActivityRegistrations';
import type { FanActivity } from '../../services/fanActivities';
import { useTheme } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';
import { Text } from '../ui';

type FanActivityRegistrationSectionProps = {
  activity: FanActivity;
  visible: boolean;
};

function formatCapacityLabel(reservedCount: number, capacity: number | null): string {
  if (capacity != null) {
    return `${reservedCount}/${capacity} deltagere`;
  }

  return reservedCount === 1 ? '1 deltager' : `${reservedCount} deltagere`;
}

function formatPriceLabel(activity: FanActivity): string {
  if (
    activity.registration_payment_mode === 'manual' &&
    activity.registration_price_dkk > 0
  ) {
    return `${activity.registration_price_dkk.toLocaleString('da-DK')} kr`;
  }

  return 'Gratis';
}

function getRegistrationStatusLabel(status: FanActivityRegistrationStatus): string {
  switch (status) {
    case 'pending_payment':
      return 'Mangler betaling';
    case 'pending_verification':
      return 'Du er tilmeldt';
    case 'confirmed':
      return 'Plads bekræftet';
    default:
      return 'Ukendt status';
  }
}

function getRegistrationStatusHint(status: FanActivityRegistrationStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Du er klar til busturen.';
    case 'pending_verification':
      return 'Vi tjekker din betaling nu. Din plads er endeligt bekræftet, når arrangøren har godkendt den.';
    case 'pending_payment':
      return 'Følg betalingsoplysningerne for at sikre din plads.';
    default:
      return '';
  }
}

function getAdminStatusLabel(status: FanActivityRegistrationStatus): string {
  switch (status) {
    case 'pending_payment':
      return 'Mangler betaling';
    case 'pending_verification':
      return 'Betalt';
    case 'confirmed':
      return 'Bekræftet';
    default:
      return 'Ukendt status';
  }
}

function formatShortReference(reference: string | null | undefined): string {
  const trimmed = reference?.trim() || '';
  if (!trimmed) {
    return 'Ref: -';
  }
  const suffix = trimmed.slice(-4);
  return `Ref: ...${suffix}`;
}

function RegistrationStatusBadge({
  status,
}: {
  status: FanActivityRegistrationStatus;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);

  const tone =
    status === 'confirmed'
      ? {
          backgroundColor: theme.colors.bg.subtle,
          borderColor: theme.colors.success,
          textColor: theme.colors.success,
        }
      : status === 'pending_verification'
        ? {
            backgroundColor: theme.colors.ctaBg,
            borderColor: theme.colors.border.active,
            textColor: theme.colors.primary,
          }
        : {
            backgroundColor: theme.colors.bg.subtle,
            borderColor: theme.colors.border.default,
            textColor: theme.colors.text.secondary,
          };

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text
        variant="small"
        color="secondary"
        style={[styles.statusBadgeText, { color: tone.textColor }]}
        numberOfLines={1}
      >
        {getRegistrationStatusLabel(status)}
      </Text>
    </View>
  );
}

function RegistrationAvatar({ label }: { label: string | null }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const initials = (label?.trim() || 'Fan')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <View style={styles.registrationAvatar}>
      <Text variant="small" color="inverse" style={styles.registrationAvatarText}>
        {initials}
      </Text>
    </View>
  );
}

export function FanActivityRegistrationSection({
  activity,
  visible,
}: FanActivityRegistrationSectionProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { role: communityRole } = useCommunityRole(activity.community_id);
  const canManageRegistrations = communityRole === 'owner' || communityRole === 'admin';
  const [registrationSummary, setRegistrationSummary] =
    useState<FanActivityRegistrationSummary | null>(null);
  const [myRegistration, setMyRegistration] = useState<FanActivityRegistration | null>(null);
  const [adminRegistrations, setAdminRegistrations] = useState<FanActivityRegistrationAdminEntry[]>(
    [],
  );
  const [loadingRegistrationState, setLoadingRegistrationState] = useState(false);
  const [registrationActionLoading, setRegistrationActionLoading] = useState(false);
  const [adminActionId, setAdminActionId] = useState<string | null>(null);

  const fallbackSummary = useMemo(
    () => getEmptyFanActivityRegistrationSummary(),
    [],
  );
  const resolvedRegistrationSummary =
    registrationSummary ?? activity.registration_summary ?? fallbackSummary;
  const reservedCount = resolvedRegistrationSummary.reservedCount;
  const pendingPaymentCount = resolvedRegistrationSummary.pendingPaymentCount;
  const capacity =
    typeof activity.registration_capacity === 'number' && activity.registration_capacity > 0
      ? activity.registration_capacity
      : null;
  const spotsLeft = capacity != null ? Math.max(0, capacity - reservedCount) : null;
  const isFull = capacity != null && reservedCount >= capacity;
  const isPaidActivity =
    activity.registration_payment_mode === 'manual' &&
    activity.registration_price_dkk > 0;
  const paymentInstructions = activity.registration_payment_instructions?.trim() || null;
  const mobilePayInfo = activity.registration_mobilepay_info?.trim() || null;
  const userHasReservedSeat =
    myRegistration?.status === 'pending_verification' || myRegistration?.status === 'confirmed';

  const handleCopy = async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert('Kopieret', `${label} er kopieret.`);
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke kopiere lige nu.');
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadRegistrationState = async () => {
      if (!visible) {
        return;
      }

      setLoadingRegistrationState(true);

      try {
        const [summaryMap, myRegistrationRow, adminRegistrationRows] = await Promise.all([
          fetchFanActivityRegistrationSummaries([activity.id]),
          user?.id ? fetchMyFanActivityRegistration(activity.id) : Promise.resolve(null),
          canManageRegistrations
            ? fetchFanActivityAdminRegistrations(activity.id)
            : Promise.resolve([] as FanActivityRegistrationAdminEntry[]),
        ]);

        if (!isActive) {
          return;
        }

        setRegistrationSummary(summaryMap[activity.id] ?? activity.registration_summary ?? fallbackSummary);
        setMyRegistration(myRegistrationRow);
        setAdminRegistrations(adminRegistrationRows);
      } catch (error: any) {
        if (!isActive) {
          return;
        }

        setRegistrationSummary(activity.registration_summary ?? fallbackSummary);
        setMyRegistration(null);
        setAdminRegistrations([]);
        Alert.alert('Fejl', error?.message || 'Kunne ikke hente tilmeldingerne lige nu.');
      } finally {
        if (isActive) {
          setLoadingRegistrationState(false);
        }
      }
    };

    void loadRegistrationState();

    return () => {
      isActive = false;
    };
  }, [activity.id, activity.registration_summary, canManageRegistrations, fallbackSummary, user?.id, visible]);

  const refreshRegistrations = async () => {
    const [summaryMap, myRegistrationRow, adminRegistrationRows] = await Promise.all([
      fetchFanActivityRegistrationSummaries([activity.id]),
      user?.id ? fetchMyFanActivityRegistration(activity.id) : Promise.resolve(null),
      canManageRegistrations
        ? fetchFanActivityAdminRegistrations(activity.id)
        : Promise.resolve([] as FanActivityRegistrationAdminEntry[]),
    ]);

    setRegistrationSummary(summaryMap[activity.id] ?? activity.registration_summary ?? fallbackSummary);
    setMyRegistration(myRegistrationRow);
    setAdminRegistrations(adminRegistrationRows);
  };

  const handleRegister = async () => {
    if (!user?.id) {
      Alert.alert('Log ind', 'Du skal være logget ind for at tilmelde dig.');
      return;
    }

    try {
      setRegistrationActionLoading(true);
      const nextRegistration = await createFanActivityRegistration(activity.id);
      setMyRegistration(nextRegistration);
      await refreshRegistrations();
      Alert.alert(
        'Tilmelding oprettet',
        nextRegistration.status === 'confirmed'
          ? 'Du er nu bekræftet på aktiviteten.'
          : 'Din tilmelding er oprettet. Følg betalingsoplysningerne for at sikre din plads.',
      );
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Kunne ikke oprette tilmeldingen.');
    } finally {
      setRegistrationActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    try {
      setRegistrationActionLoading(true);
      const nextRegistration = await markFanActivityRegistrationPaid(activity.id);
      setMyRegistration(nextRegistration);
      await refreshRegistrations();
      Alert.alert('Tak', 'Din tilmelding står nu som afventer verificering.');
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Kunne ikke opdatere din betalingsstatus.');
    } finally {
      setRegistrationActionLoading(false);
    }
  };

  const handleAdminStatusUpdate = async (
    registrationId: string,
    nextStatus: FanActivityRegistrationStatus,
  ) => {
    try {
      setAdminActionId(registrationId);
      await adminUpdateFanActivityRegistrationStatus({
        registrationId,
        status: nextStatus,
      });
      await refreshRegistrations();
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Kunne ikke opdatere tilmeldingen.');
    } finally {
      setAdminActionId(null);
    }
  };

  return (
    <View style={styles.registrationPanel}>
      <View style={styles.registrationHeader}>
        <View style={styles.registrationHeaderCopy}>
          <Text variant="small" color="muted" style={styles.registrationEyebrow}>
            TILMELDING
          </Text>
          <Text variant="h3" color="primary" style={styles.registrationTitle}>
            {formatCapacityLabel(reservedCount, capacity)}
          </Text>
        </View>

        <View style={styles.registrationHeaderMeta}>
          <View style={styles.registrationMetaPill}>
            <Text variant="small" color="secondary" style={styles.registrationMetaText}>
              {formatPriceLabel(activity)}
            </Text>
          </View>
          {isFull ? (
            <View style={styles.registrationMetaPill}>
              <Text variant="small" color="secondary" style={styles.registrationMetaText}>
                Fuldt booket
              </Text>
            </View>
          ) : spotsLeft != null ? (
            <View style={styles.registrationMetaPill}>
              <Text variant="small" color="secondary" style={styles.registrationMetaText}>
                {spotsLeft} pladser tilbage
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {loadingRegistrationState ? (
        <View style={styles.registrationLoadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="caption" color="secondary">
            Henter tilmeldingsstatus...
          </Text>
        </View>
      ) : null}

      {!loadingRegistrationState && !myRegistration ? (
        <View style={styles.registrationBody}>
          <Text variant="body" color="secondary" style={styles.registrationLead}>
            {isPaidActivity
              ? 'Tilmeld dig for at få MobilePay-info og din personlige betalingsreference.'
              : 'Tilmeld dig direkte her, hvis du vil sikre din plads.'}
          </Text>

          {isPaidActivity ? (
            <Text variant="caption" color="secondary" style={styles.registrationNote}>
              Du er først endeligt tilmeldt, når betalingen er modtaget og godkendt af arrangøren.
            </Text>
          ) : null}

          <PrimaryButton
            title={
              isFull
                ? 'Fuldt booket'
                : isPaidActivity
                  ? 'Tilmeld mig'
                  : 'Tilmeld mig gratis'
            }
            onPress={handleRegister}
            disabled={registrationActionLoading || isFull}
          />

          {!user?.id ? (
            <Text variant="caption" color="secondary" style={styles.registrationFootnote}>
              Du skal være logget ind for at kunne tilmelde dig.
            </Text>
          ) : null}
        </View>
      ) : null}

      {!loadingRegistrationState && myRegistration ? (
        <View style={styles.registrationBody}>
          <View style={styles.registrationStatusRow}>
            <RegistrationStatusBadge status={myRegistration.status} />
            <Text variant="small" color="secondary" style={styles.registrationStatusHint}>
              {getRegistrationStatusHint(myRegistration.status)}
            </Text>
          </View>

          {isPaidActivity ? (
            <View style={styles.paymentInfoBlock}>
              {myRegistration.status === 'pending_payment' ? (
                <View style={styles.paymentGuide}>
                  <Text variant="caption" color="secondary" style={styles.paymentGuideTitle}>
                    Sådan gør du:
                  </Text>
                  <Text variant="caption" color="secondary" style={styles.paymentGuideItem}>
                    1. Åbn MobilePay
                  </Text>
                  <View style={styles.paymentGuideInline}>
                    <Text variant="caption" color="secondary" style={styles.paymentGuideItem}>
                      2. Kopiér nummeret og betal
                    </Text>
                    <View style={styles.paymentInfoValueRow}>
                      <Text
                        variant="body"
                        color="primary"
                        style={styles.paymentInfoValue}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {mobilePayInfo || 'Info kommer fra arrangøren'}
                      </Text>
                      {mobilePayInfo ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.copyButton,
                            pressed ? styles.copyButtonPressed : null,
                          ]}
                          onPress={() => handleCopy(mobilePayInfo, 'MobilePay')}
                        >
                          <Text variant="small" color="primary" style={styles.copyButtonText}>
                            Kopiér
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.paymentGuideInline}>
                    <Text variant="caption" color="secondary" style={styles.paymentGuideItem}>
                      3. Kopiér referencen og indsæt den i kommentarfeltet
                    </Text>
                    <View style={styles.paymentInfoValueRow}>
                      <Text
                        variant="bodyBold"
                        color="primary"
                        style={styles.paymentReference}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        selectable
                      >
                        {myRegistration.paymentReference}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.copyButton,
                          pressed ? styles.copyButtonPressed : null,
                        ]}
                        onPress={() => handleCopy(myRegistration.paymentReference, 'Reference')}
                      >
                        <Text variant="small" color="primary" style={styles.copyButtonText}>
                          Kopiér
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text variant="caption" color="secondary" style={styles.paymentGuideItem}>
                    4. Gennemfør betalingen i MobilePay
                  </Text>
                  <Text variant="caption" color="secondary" style={styles.paymentGuideItem}>
                    5. Gå tilbage hertil og tryk “Jeg har betalt”
                  </Text>
                  <Text variant="caption" color="secondary" style={styles.paymentGuideNote}>
                    Du er først endeligt tilmeldt, når betalingen er godkendt.
                  </Text>
                </View>
              ) : null}

              {paymentInstructions ? (
                <Text variant="caption" color="secondary" style={styles.registrationNote}>
                  {paymentInstructions}
                </Text>
              ) : null}
            </View>
          ) : null}

          {myRegistration.status === 'pending_payment' ? (
            <PrimaryButton
              title="Jeg har betalt"
              onPress={handleMarkPaid}
              disabled={registrationActionLoading || (isFull && !userHasReservedSeat)}
            />
          ) : null}
        </View>
      ) : null}

      {canManageRegistrations ? (
        <View style={styles.adminPanel}>
          <View style={styles.adminHeader}>
            <Text variant="bodyBold" color="primary" style={styles.adminTitle}>
              Arrangøroverblik
            </Text>
            <Text variant="caption" color="secondary">
              {pendingPaymentCount > 0
                ? `${pendingPaymentCount} afventer betaling`
                : 'Alle tilmeldinger er synlige her'}
            </Text>
          </View>

          {adminRegistrations.length === 0 ? (
            <Text variant="caption" color="secondary">
              Ingen tilmeldinger endnu.
            </Text>
          ) : (
            <View style={styles.adminList}>
              {adminRegistrations.map((entry) => {
                const entryLabel = entry.displayName?.trim() || 'Fan';
                const secondaryLabel =
                  entry.username && entry.username !== entry.displayName
                    ? `(${entry.username})`
                    : null;
                const isBusy = adminActionId === entry.id;
                const isPaid = entry.status !== 'pending_payment';
                const isConfirmed = entry.status === 'confirmed';

                return (
                  <View key={entry.id} style={styles.adminRow}>
                    <View style={styles.adminTopRow}>
                      <RegistrationAvatar label={entryLabel} />
                      <View style={styles.adminTopCopy}>
                        <Text variant="body" color="primary" style={styles.adminName}>
                          {entryLabel}
                        </Text>
                        {secondaryLabel ? (
                          <Text
                            variant="caption"
                            color="secondary"
                            style={styles.adminSecondaryName}
                          >
                            {secondaryLabel}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <Text variant="small" color="secondary" style={styles.adminStatusText}>
                      Status: {getAdminStatusLabel(entry.status)}
                    </Text>

                    {isPaidActivity ? (
                      <View style={styles.adminReferenceRow}>
                        <Text
                          variant="small"
                          color="muted"
                          style={styles.adminReference}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {formatShortReference(entry.paymentReference)}
                        </Text>
                        <Pressable
                          style={({ pressed }) => [
                            styles.copyInlineButton,
                            pressed ? styles.copyButtonPressed : null,
                          ]}
                          onPress={() => handleCopy(entry.paymentReference, 'Reference')}
                        >
                          <Text variant="small" color="primary" style={styles.copyButtonText}>
                            Kopiér
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {isPaidActivity ? (
                      <View style={styles.adminActions}>
                        <View style={styles.adminPaidToggle}>
                          <Text variant="small" color="secondary" style={styles.adminToggleLabel}>
                            Marker som betalt
                          </Text>
                          <Switch
                            value={isPaid}
                            onValueChange={(nextValue) =>
                              handleAdminStatusUpdate(
                                entry.id,
                                nextValue ? 'pending_verification' : 'pending_payment',
                              )
                            }
                            disabled={isBusy || isConfirmed}
                            trackColor={{
                              false: theme.colors.border.default,
                              true: theme.colors.primary,
                            }}
                            thumbColor={theme.colors.bg.card}
                          />
                        </View>

                        {entry.status === 'pending_verification' ? (
                          <Pressable
                            style={({ pressed }) => [
                              styles.adminActionButton,
                              styles.adminActionPrimary,
                              pressed ? styles.adminActionPressed : null,
                              isBusy ? styles.adminActionDisabled : null,
                            ]}
                            onPress={() => handleAdminStatusUpdate(entry.id, 'confirmed')}
                            disabled={isBusy || !isPaid}
                          >
                            <Text variant="small" color="inverse" style={styles.adminActionText}>
                              Bekræft
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    registrationPanel: {
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      backgroundColor: theme.colors.bg.subtle,
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    registrationEyebrow: {
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    registrationHeader: {
      gap: theme.spacing[2],
    },
    registrationHeaderCopy: {
      gap: theme.spacing[1] / 2,
    },
    registrationTitle: {
      fontWeight: '800',
    },
    registrationHeaderMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    registrationMetaPill: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    registrationMetaText: {
      fontWeight: '600',
    },
    registrationLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    registrationBody: {
      gap: theme.spacing[3],
    },
    registrationLead: {
      lineHeight: theme.spacing[5],
    },
    registrationNote: {
      lineHeight: theme.spacing[4],
    },
    registrationFootnote: {
      lineHeight: theme.spacing[4],
    },
    registrationStatusRow: {
      gap: theme.spacing[2],
    },
    registrationStatusHint: {
      lineHeight: theme.spacing[4],
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
    },
    statusBadgeText: {
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    paymentInfoBlock: {
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[3],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    paymentGuide: {
      gap: theme.spacing[1],
      paddingTop: theme.spacing[1],
    },
    paymentGuideTitle: {
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    paymentGuideInline: {
      gap: theme.spacing[1],
    },
    paymentGuideItem: {
      lineHeight: theme.spacing[4],
    },
    paymentGuideNote: {
      lineHeight: theme.spacing[4],
      fontWeight: '700',
    },
    paymentInfoRow: {
      gap: theme.spacing[1],
    },
    paymentInfoValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      flexWrap: 'nowrap',
    },
    paymentInfoLabel: {
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    paymentInfoValue: {
      fontWeight: '600',
      flexShrink: 1,
    },
    paymentReference: {
      fontWeight: '800',
      letterSpacing: 0.4,
      flexShrink: 1,
    },
    copyButton: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.subtle,
    },
    copyButtonPressed: {
      opacity: 0.7,
    },
    copyButtonText: {
      fontWeight: '700',
    },
    adminPanel: {
      gap: theme.spacing[3],
      paddingTop: theme.spacing[1],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.subtle,
    },
    adminHeader: {
      gap: theme.spacing[1],
    },
    adminTitle: {
      fontWeight: '700',
    },
    adminList: {
      gap: theme.spacing[3],
    },
    adminRow: {
      flexDirection: 'column',
      gap: theme.spacing[2],
      paddingBottom: theme.spacing[2],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
    },
    adminTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    adminTopCopy: {
      flex: 1,
      gap: theme.spacing[0],
    },
    registrationAvatar: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    registrationAvatarText: {
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    adminName: {
      fontWeight: '700',
    },
    adminSecondaryName: {
      lineHeight: theme.spacing[4],
    },
    adminStatusText: {
      fontWeight: '600',
    },
    adminReference: {
      lineHeight: theme.spacing[4],
      flexShrink: 1,
      minWidth: 0,
    },
    adminReferenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      flexShrink: 1,
    },
    adminActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    adminPaidToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    adminToggleLabel: {
      fontWeight: '600',
    },
    adminActionButton: {
      minHeight: theme.spacing[8],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      justifyContent: 'center',
      borderWidth: theme.layout.borderHairline,
      maxWidth: theme.spacing[16] * 2,
    },
    adminActionPrimary: {
      backgroundColor: theme.components.button.variants.primary.bg,
      borderColor: theme.components.button.variants.primary.bg,
    },
    adminActionSecondary: {
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.border.default,
    },
    adminActionText: {
      fontWeight: '700',
      textAlign: 'center',
    },
    adminActionSecondaryText: {
      fontWeight: '700',
      textAlign: 'center',
    },
    adminActionPressed: {
      opacity: 0.86,
    },
    adminActionDisabled: {
      opacity: 0.5,
    },
    copyInlineButton: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[0],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.subtle,
    },
  });
}
