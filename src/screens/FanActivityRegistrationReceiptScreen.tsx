import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, type BadgeVariant } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Text } from '../components/ui';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchMyFanActivityRegistrationDetail,
  type FanActivityRegistrationListItem,
  type FanActivityRegistrationStatus,
} from '../services/fanActivityRegistrations';
import { formatEventDate } from '../services/profileApi';
import { useTheme } from '../theme';

type RegistrationReceiptRoute = RouteProp<
  { FanActivityRegistrationReceipt: { registrationId: string } },
  'FanActivityRegistrationReceipt'
>;

type StatusCopy = {
  label: string;
  hint: string;
  variant: BadgeVariant;
  highlight?: 'success';
};

function getStatusCopy(status: FanActivityRegistrationStatus): StatusCopy {
  switch (status) {
    case 'pending_payment':
      return {
        label: 'Mangler betaling',
        hint: 'Følg betalingsoplysningerne for at sikre din plads.',
        variant: 'warning',
      };
    case 'pending_verification':
      return {
        label: 'Du er tilmeldt',
        hint: 'Vi tjekker din betaling nu. Din plads er endeligt bekræftet, når arrangøren har godkendt den.',
        variant: 'info',
      };
    case 'confirmed':
      return {
        label: 'Plads bekræftet',
        hint: 'Du er klar til busturen.',
        variant: 'success',
        highlight: 'success',
      };
    default:
      return {
        label: 'Ukendt status',
        hint: '',
        variant: 'neutral',
      };
  }
}

export default function FanActivityRegistrationReceiptScreen() {
  const navigation = useNavigation();
  const route = useRoute<RegistrationReceiptRoute>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const registrationId = route.params?.registrationId ?? '';
  const [registration, setRegistration] = useState<FanActivityRegistrationListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadRegistration = async () => {
      setLoading(true);
      try {
        const detail = await fetchMyFanActivityRegistrationDetail(registrationId);
        if (isActive) {
          setRegistration(detail);
        }
      } catch {
        if (isActive) {
          setRegistration(null);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadRegistration();

    return () => {
      isActive = false;
    };
  }, [registrationId]);

  const statusCopy = useMemo(
    () => (registration ? getStatusCopy(registration.status) : null),
    [registration],
  );

  const dateLabel = registration?.activityStartsAt
    ? formatEventDate(registration.activityStartsAt)
    : 'Dato ikke sat';
  const locationLabel =
    registration?.activityLocationName ||
    registration?.activityLocationAddress ||
    'Sted ikke angivet';
  const organizerLabel = registration?.communityName ?? 'Ukendt arrangør';
  const isPaidActivity =
    registration?.registrationPaymentMode === 'manual' &&
    Math.max(0, registration?.registrationPriceDkk ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.headerButton,
              pressed ? styles.headerButtonPressed : null,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.text.primary} />
            <Text variant="small" color="primary">
              Tilbage
            </Text>
          </Pressable>
          <Text variant="h3" color="primary" style={styles.headerTitle}>
            Min tilmelding
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="caption" color="secondary">
              Henter din tilmelding...
            </Text>
          </View>
        ) : registration ? (
          <View style={styles.content}>
            <Card style={styles.card}>
              <Text variant="h2" color="primary" style={styles.activityTitle}>
                {registration.activityTitle || 'Fanaktivitet'}
              </Text>
              <Text variant="body" color="secondary" style={styles.activityMeta}>
                {dateLabel}
              </Text>
              <Text variant="body" color="secondary" style={styles.activityMeta}>
                {locationLabel}
              </Text>
              <Text variant="body" color="secondary" style={styles.activityMeta}>
                Arrangør: {organizerLabel}
              </Text>

              {statusCopy ? (
                <View
                  style={[
                    styles.statusCard,
                    statusCopy.highlight === 'success' ? styles.statusCardSuccess : null,
                  ]}
                >
                  <Badge label={statusCopy.label} variant={statusCopy.variant} />
                  {statusCopy.hint ? (
                    <Text variant="caption" color="secondary" style={styles.statusHint}>
                      {statusCopy.hint}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>

            {registration.status === 'confirmed' ? (
              <PrimaryButton
                title="Vis bekræftelse"
                onPress={() =>
                  (navigation as any).navigate('FanActivityRegistrationPass', {
                    registrationId,
                  })
                }
              />
            ) : null}

            {isPaidActivity ? (
              <Card style={styles.card}>
                <Text variant="h3" color="primary" style={styles.sectionTitle}>
                  Betaling
                </Text>
                <View style={styles.detailRow}>
                  <Text variant="caption" color="secondary" style={styles.detailLabel}>
                    Pris
                  </Text>
                  <Text variant="body" color="primary" style={styles.detailValue}>
                    {Math.max(0, registration?.registrationPriceDkk ?? 0)} kr
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text variant="caption" color="secondary" style={styles.detailLabel}>
                    MobilePay
                  </Text>
                  <Text variant="body" color="primary" style={styles.detailValue}>
                    {registration?.registrationMobilepayInfo || 'Info mangler'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text variant="caption" color="secondary" style={styles.detailLabel}>
                    Reference
                  </Text>
                  <Text variant="bodyBold" color="primary" style={styles.detailValue}>
                    {registration?.paymentReference}
                  </Text>
                </View>
                {registration?.registrationPaymentInstructions ? (
                  <Text variant="caption" color="secondary" style={styles.detailNote}>
                    {registration.registrationPaymentInstructions}
                  </Text>
                ) : null}
              </Card>
            ) : null}
          </View>
        ) : (
          <Card style={styles.card}>
            <Text variant="body" color="secondary">
              Kunne ikke finde tilmeldingen lige nu.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    container: {
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    headerRow: {
      gap: theme.spacing[2],
    },
    headerButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    headerButtonPressed: {
      opacity: 0.7,
    },
    headerTitle: {
      fontWeight: '800',
    },
    loadingState: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    content: {
      gap: theme.spacing[2],
    },
    card: {
      padding: theme.spacing[4],
      gap: theme.spacing[1],
      backgroundColor: theme.colors.bg.card,
    },
    activityTitle: {
      fontWeight: '800',
    },
    activityMeta: {
      lineHeight: theme.spacing[4],
    },
    sectionTitle: {
      fontWeight: '700',
    },
    statusCard: {
      gap: theme.spacing[1],
      padding: theme.spacing[2],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.subtle,
      marginTop: theme.spacing[1],
    },
    statusCardSuccess: {
      borderColor: theme.colors.state.success,
    },
    statusHint: {
      lineHeight: theme.spacing[4],
    },
    detailRow: {
      gap: theme.spacing[1],
    },
    detailLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    detailValue: {
      fontWeight: '600',
    },
    detailNote: {
      lineHeight: theme.spacing[4],
      marginTop: theme.spacing[0],
    },
  });
}
