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
import { PrimaryButton } from '../components/PrimaryButton';
import { Text } from '../components/ui';
import {
  fetchMyFanActivityRegistrationDetail,
  type FanActivityRegistrationListItem,
  type FanActivityRegistrationStatus,
} from '../services/fanActivityRegistrations';
import { formatEventDate } from '../services/profileApi';
import { useTheme } from '../theme';

type RegistrationPassRoute = RouteProp<
  { FanActivityRegistrationPass: { registrationId: string } },
  'FanActivityRegistrationPass'
>;

type StatusState = {
  title: string;
  hint: string;
};

function getNotConfirmedCopy(status: FanActivityRegistrationStatus): StatusState {
  if (status === 'pending_verification') {
    return {
      title: 'Ikke endeligt bekræftet endnu',
      hint: 'Vi afventer godkendelse af din betaling.',
    };
  }

  return {
    title: 'Ikke endeligt bekræftet endnu',
    hint: 'Følg betalingsoplysningerne for at sikre din plads.',
  };
}

export default function FanActivityRegistrationPassScreen() {
  const navigation = useNavigation();
  const route = useRoute<RegistrationPassRoute>();
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

  const isConfirmed = registration?.status === 'confirmed';
  const fallbackState = useMemo(
    () =>
      registration ? getNotConfirmedCopy(registration.status) : null,
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
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="caption" color="secondary">
              Henter bekræftelse...
            </Text>
          </View>
        ) : registration ? (
          isConfirmed ? (
            <View style={styles.passCard}>
              <Text variant="h1" color="primary" style={styles.passTitle}>
                Plads bekræftet
              </Text>
              <Text variant="h2" color="primary" style={styles.passActivityTitle}>
                {registration.activityTitle || 'Fanaktivitet'}
              </Text>
              <Text variant="body" color="secondary" style={styles.passMeta}>
                {dateLabel}
              </Text>
              <Text variant="body" color="secondary" style={styles.passMeta}>
                {locationLabel}
              </Text>
              <Text variant="body" color="secondary" style={styles.passMeta}>
                Arrangør: {organizerLabel}
              </Text>
              <Text variant="caption" color="secondary" style={styles.passReference}>
                Reference: {registration.paymentReference}
              </Text>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <Text variant="h3" color="primary" style={styles.infoTitle}>
                {fallbackState?.title}
              </Text>
              <Text variant="body" color="secondary" style={styles.infoHint}>
                {fallbackState?.hint}
              </Text>
              <PrimaryButton title="Tilbage til detaljer" onPress={() => navigation.goBack()} />
            </View>
          )
        ) : (
          <View style={styles.infoCard}>
            <Text variant="body" color="secondary">
              Kunne ikke finde bekræftelsen lige nu.
            </Text>
            <PrimaryButton title="Tilbage" onPress={() => navigation.goBack()} />
          </View>
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
      padding: theme.spacing[5],
      gap: theme.spacing[4],
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
    loadingState: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    passCard: {
      paddingVertical: theme.spacing[6],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.state.success,
      backgroundColor: theme.colors.bg.card,
      gap: theme.spacing[3],
      alignItems: 'center',
    },
    passTitle: {
      fontWeight: '800',
      textTransform: 'uppercase',
      color: theme.colors.state.success,
      textAlign: 'center',
    },
    passActivityTitle: {
      fontWeight: '800',
      textAlign: 'center',
    },
    passMeta: {
      textAlign: 'center',
      lineHeight: theme.spacing[4],
    },
    passReference: {
      marginTop: theme.spacing[2],
      textAlign: 'center',
    },
    infoCard: {
      padding: theme.spacing[4],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.card,
      gap: theme.spacing[3],
    },
    infoTitle: {
      fontWeight: '700',
    },
    infoHint: {
      lineHeight: theme.spacing[4],
    },
  });
}
