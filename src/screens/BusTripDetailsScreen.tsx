import React, { useState, useEffect } from 'react';
import { logger } from '../lib/logger';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Linking,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { fetchBusTripById, type BusTrip } from '../services/eventsApi';
import { useTheme, defaultTheme as theme } from '../theme';

type BusTripDetailsRouteProp = RouteProp<
  { BusTripDetails: { busTripId: string } },
  'BusTripDetails'
>;

export default function BusTripDetailsScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation();
  const route = useRoute<BusTripDetailsRouteProp>();
  const { busTripId } = route.params;
  const insets = useSafeAreaInsets();
  const [busTrip, setBusTrip] = useState<BusTrip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBusTrip();
  }, [busTripId]);

  const loadBusTrip = async () => {
    logger.log('[BusTripDetailsScreen] Loading bus trip:', busTripId);
    setLoading(true);
    const data = await fetchBusTripById(busTripId);
    logger.log('[BusTripDetailsScreen] Bus trip data received:', data);
    setBusTrip(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Bustur detaljer</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Henter bustur...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!busTrip) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Bustur detaljer</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>🚌</Text>
          <Text style={styles.errorText}>Kunne ikke finde busturen</Text>
        </View>
      </SafeAreaView>
    );
  }

  const startDate = new Date(busTrip.start_at);
  const dateStr = startDate.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeStr = startDate.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const returnStr = busTrip.expected_return_at
    ? new Date(busTrip.expected_return_at).toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const seatsLeft = busTrip.total_seats - busTrip.seats_taken;
  const isFull = seatsLeft === 0;

  const handleOpenMaps = () => {
    if (busTrip.departure_address) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        busTrip.departure_address,
      )}`;
      Linking.openURL(url);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Bustur detaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing[6] }}
      >
        {/* Trip Details Card */}
        <Card style={styles.detailsCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🚌 BUSTUR</Text>
          </View>
          <Text style={styles.tripTitle}>{busTrip.title}</Text>
          {busTrip.description && <Text style={styles.description}>{busTrip.description}</Text>}

          {/* Match Info (if linked) */}
          {busTrip.fixture && (
            <View style={styles.matchInfoBanner}>
              <Text style={styles.matchLabel}>Tilknyttet kamp</Text>
              <Text style={styles.matchTeams}>
                {busTrip.fixture.home_team} vs {busTrip.fixture.away_team}
              </Text>
              {busTrip.fixture.venue && (
                <Text style={styles.matchVenue}>📍 {busTrip.fixture.venue}</Text>
              )}
            </View>
          )}

          <View style={styles.detailsList}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar" size={20} color={theme.colors.primary} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Dato og afgang</Text>
                <Text style={styles.detailValue}>
                  {dateStr}, kl. {timeStr}
                </Text>
              </View>
            </View>

            {returnStr && (
              <View style={styles.detailRow}>
                <Ionicons name="home" size={20} color={theme.colors.primary} />
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Forventet hjemkomst</Text>
                  <Text style={styles.detailValue}>Ca. kl. {returnStr}</Text>
                </View>
              </View>
            )}

            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={theme.colors.primary} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Mødested</Text>
                <Text style={styles.detailValue}>{busTrip.departure_place}</Text>
                {busTrip.departure_address && (
                  <>
                    <Text style={styles.detailSubvalue}>{busTrip.departure_address}</Text>
                    <TouchableOpacity onPress={handleOpenMaps}>
                      <Text style={styles.mapsLink}>Åbn i Maps →</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="people" size={20} color={theme.colors.primary} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Ledige pladser</Text>
                <Text
                  style={[
                    styles.detailValue,
                    isFull && styles.fullText,
                    !isFull && seatsLeft < 10 && styles.warningText,
                  ]}
                >
                  {isFull ? 'FULDT BOOKET' : `${seatsLeft} / ${busTrip.total_seats}`}
                </Text>
              </View>
            </View>

            {busTrip.price_dkk !== null && (
              <View style={styles.detailRow}>
                <Ionicons name="cash" size={20} color={theme.colors.primary} />
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Pris</Text>
                  <Text style={styles.detailValue}>{busTrip.price_dkk} kr.</Text>
                </View>
              </View>
            )}
          </View>
        </Card>

        {/* What's Included */}
        {busTrip.includes && busTrip.includes.length > 0 && (
          <Card style={styles.includesCard}>
            <Text style={styles.sectionTitle}>Hvad er inkluderet?</Text>
            {busTrip.includes.map((item, index) => (
              <View key={index} style={styles.includeItem}>
                <Text style={styles.includeBullet}>✓</Text>
                <Text style={styles.includeText}>{item}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Organizer */}
        {busTrip.organizer && (
          <Card style={styles.organizerCard}>
            <Text style={styles.sectionTitle}>Arrangør</Text>
            <View style={styles.organizerInfo}>
              {busTrip.organizer.logo_url ? (
                <Image source={{ uri: busTrip.organizer.logo_url }} style={styles.organizerLogo} />
              ) : (
                <View style={styles.organizerLogoPlaceholder}>
                  <Text style={styles.organizerLogoText}>
                    {busTrip.organizer.name.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.organizerText}>
                <Text style={styles.organizerName}>{busTrip.organizer.name}</Text>
                {busTrip.organizer.description && (
                  <Text style={styles.organizerDescription}>{busTrip.organizer.description}</Text>
                )}
              </View>
            </View>
          </Card>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      backgroundColor: theme.colors.primary,
    },
    backButton: {
      padding: theme.spacing[1],
      marginRight: theme.spacing[2],
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.bg.card,
    },
    scrollView: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.bg.default,
    },
    loadingText: {
      marginTop: theme.spacing[4],
      fontSize: 14,
      color: theme.colors.text.secondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.bg.default,
    },
    errorIcon: {
      fontSize: 64,
      marginBottom: theme.spacing[4],
    },
    errorText: {
      fontSize: 16,
      color: theme.colors.text.primary,
    },
    detailsCard: {
      margin: theme.spacing[4],
    },
    badge: {
      backgroundColor: theme.colors.state.warning,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.sm,
      alignSelf: 'flex-start',
      marginBottom: theme.spacing[2],
    },
    badgeText: {
      color: theme.colors.bg.card,
      fontSize: 12,
      fontWeight: '700',
    },
    tripTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    description: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      lineHeight: 20,
      marginBottom: theme.spacing[4],
    },
    matchInfoBanner: {
      backgroundColor: theme.colors.bg.elevated,
      padding: theme.spacing[4],
      borderRadius: theme.radius.sm,
      marginBottom: theme.spacing[4],
    },
    matchLabel: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing[1],
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    matchTeams: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
    },
    matchVenue: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    detailsList: {
      marginTop: theme.spacing[2],
    },
    detailRow: {
      flexDirection: 'row',
      marginBottom: theme.spacing[4],
    },
    detailText: {
      flex: 1,
      marginLeft: theme.spacing[2],
    },
    detailLabel: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing[0],
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    detailSubvalue: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      marginTop: theme.spacing[0],
    },
    mapsLink: {
      fontSize: 13,
      color: theme.colors.primary,
      fontWeight: '600',
      marginTop: theme.spacing[1],
    },
    fullText: {
      color: theme.colors.text.secondary,
    },
    warningText: {
      color: theme.colors.state.warning,
    },
    includesCard: {
      margin: theme.spacing[4],
      marginTop: theme.spacing[0],
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[4],
    },
    includeItem: {
      flexDirection: 'row',
      marginBottom: theme.spacing[2],
    },
    includeBullet: {
      fontSize: 16,
      color: theme.colors.primary,
      marginRight: theme.spacing[2],
      fontWeight: '700',
    },
    includeText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text.primary,
      lineHeight: 20,
    },
    organizerCard: {
      margin: theme.spacing[4],
      marginTop: theme.spacing[0],
    },
    organizerInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    organizerLogo: {
      width: 50,
      height: 50,
      borderRadius: theme.radius.pill,
      marginRight: theme.spacing[4],
    },
    organizerLogoPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing[4],
    },
    organizerLogoText: {
      color: theme.colors.bg.card,
      fontSize: 16,
      fontWeight: '700',
    },
    organizerText: {
      flex: 1,
    },
    organizerName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
    },
    organizerDescription: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    ctaContainer: {
      marginHorizontal: theme.spacing[4],
      marginBottom: theme.spacing[4],
    },
    fullBanner: {
      backgroundColor: theme.colors.bg.elevated,
      padding: theme.spacing[4],
      borderRadius: theme.radius.sm,
      alignItems: 'center',
    },
    fullBannerText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    participantsCard: {
      margin: theme.spacing[4],
      marginTop: theme.spacing[0],
    },
    placeholderText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      fontStyle: 'italic',
    },
  });
