import React, { useState, useEffect } from 'react';
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
import { PrimaryButton } from '../components/PrimaryButton';
import { fetchBusTripById, type BusTrip } from '../services/eventsApi';
import { colors, spacing } from '../theme';

type BusTripDetailsRouteProp = RouteProp<
  { BusTripDetails: { busTripId: string } },
  'BusTripDetails'
>;

export default function BusTripDetailsScreen() {
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
    console.log('[BusTripDetailsScreen] Loading bus trip:', busTripId);
    setLoading(true);
    const data = await fetchBusTripById(busTripId);
    console.log('[BusTripDetailsScreen] Bus trip data received:', data);
    setBusTrip(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.card} />
          </Pressable>
          <Text style={styles.headerTitle}>Bustur detaljer</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.fcnRed} />
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
            <Ionicons name="arrow-back" size={24} color={colors.card} />
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
        busTrip.departure_address
      )}`;
      Linking.openURL(url);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Bustur detaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {/* Trip Details Card */}
        <Card style={styles.detailsCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🚌 BUSTUR</Text>
          </View>
          <Text style={styles.tripTitle}>{busTrip.title}</Text>
          {busTrip.description && (
            <Text style={styles.description}>{busTrip.description}</Text>
          )}

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
              <Ionicons name="calendar" size={20} color={colors.fcnRed} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Dato og afgang</Text>
                <Text style={styles.detailValue}>
                  {dateStr}, kl. {timeStr}
                </Text>
              </View>
            </View>

            {returnStr && (
              <View style={styles.detailRow}>
                <Ionicons name="home" size={20} color={colors.fcnRed} />
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Forventet hjemkomst</Text>
                  <Text style={styles.detailValue}>Ca. kl. {returnStr}</Text>
                </View>
              </View>
            )}

            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={colors.fcnRed} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Mødested</Text>
                <Text style={styles.detailValue}>{busTrip.departure_place}</Text>
                {busTrip.departure_address && (
                  <>
                    <Text style={styles.detailSubvalue}>
                      {busTrip.departure_address}
                    </Text>
                    <TouchableOpacity onPress={handleOpenMaps}>
                      <Text style={styles.mapsLink}>Åbn i Maps →</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="people" size={20} color={colors.fcnRed} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Ledige pladser</Text>
                <Text
                  style={[
                    styles.detailValue,
                    isFull && styles.fullText,
                    !isFull && seatsLeft < 10 && styles.warningText,
                  ]}
                >
                  {isFull
                    ? 'FULDT BOOKET'
                    : `${seatsLeft} / ${busTrip.total_seats}`}
                </Text>
              </View>
            </View>

            {busTrip.price_dkk !== null && (
              <View style={styles.detailRow}>
                <Ionicons name="cash" size={20} color={colors.fcnRed} />
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
                <Image
                  source={{ uri: busTrip.organizer.logo_url }}
                  style={styles.organizerLogo}
                />
              ) : (
                <View style={styles.organizerLogoPlaceholder}>
                  <Text style={styles.organizerLogoText}>
                    {busTrip.organizer.name.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.organizerText}>
                <Text style={styles.organizerName}>
                  {busTrip.organizer.name}
                </Text>
                {busTrip.organizer.description && (
                  <Text style={styles.organizerDescription}>
                    {busTrip.organizer.description}
                  </Text>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* CTA Button */}
        <View style={styles.ctaContainer}>
          {isFull ? (
            <View style={styles.fullBanner}>
              <Text style={styles.fullBannerText}>Alle pladser er booket</Text>
            </View>
          ) : (
            <PrimaryButton
              title={`Book plads nu${busTrip.price_dkk ? ` (${busTrip.price_dkk} kr.)` : ''}`}
              onPress={() => {
                // TODO: Implement booking flow
                console.log('Book bus trip:', busTripId);
              }}
            />
          )}
        </View>

        {/* Placeholder: Participants */}
        <Card style={styles.participantsCard}>
          <Text style={styles.sectionTitle}>
            Deltagere ({busTrip.seats_taken})
          </Text>
          <Text style={styles.placeholderText}>
            Deltagerliste kommer snart...
          </Text>
        </Card>
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
  errorIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 16,
    color: colors.text,
  },
  detailsCard: {
    margin: spacing.md,
  },
  badge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  badgeText: {
    color: colors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  tripTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 14,
    color: colors.subtext,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  matchInfoBanner: {
    backgroundColor: colors.fcnRed + '10',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  matchLabel: {
    fontSize: 11,
    color: colors.subtext,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  matchTeams: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  matchVenue: {
    fontSize: 13,
    color: colors.subtext,
  },
  detailsList: {
    marginTop: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  detailText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  detailSubvalue: {
    fontSize: 13,
    color: colors.subtext,
    marginTop: 2,
  },
  mapsLink: {
    fontSize: 13,
    color: colors.fcnRed,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  fullText: {
    color: colors.subtext,
  },
  warningText: {
    color: '#FF9500',
  },
  includesCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  includeItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  includeBullet: {
    fontSize: 16,
    color: colors.fcnRed,
    marginRight: spacing.sm,
    fontWeight: '700',
  },
  includeText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  organizerCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: spacing.md,
  },
  organizerLogoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  organizerLogoText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  organizerText: {
    flex: 1,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  organizerDescription: {
    fontSize: 13,
    color: colors.subtext,
  },
  ctaContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  fullBanner: {
    backgroundColor: colors.subtext + '20',
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  fullBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.subtext,
  },
  participantsCard: {
    margin: spacing.md,
    marginTop: 0,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.subtext,
    fontStyle: 'italic',
  },
});