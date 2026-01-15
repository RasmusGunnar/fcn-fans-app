import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

const matches = [
  {
    id: 'match-1',
    title: 'FCN vs Brøndby',
    date: 'Lørdag 18. januar 2025',
    time: '14:00',
    venue: 'Right to Dream Park',
  },
];

const trips = [
  {
    id: 'trip-1',
    title: 'Bustur til Silkeborg',
    date: 'Lørdag 18. januar 2025',
    departure: '14:00',
    location: 'Afgang fra Farum Station',
    spotsLeft: 12,
  },
];

export default function EventsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  const navigateToMatchDetails = (matchId: string) => {
    (navigation as any).navigate('MatchDetails', { matchId });
  };

  const navigateToBusTripDetails = (tripId: string) => {
    (navigation as any).navigate('BusTripDetails', { tripId });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
    >
      <AppHeader title="Events & Busture" subtitle="Kommende kampe og rejser" />

      <View style={styles.content}>
        {/* Matches */}
        {matches.map(match => (
          <Card key={match.id} style={styles.eventCard}>
            <Pill label="KAMP" variant="neutral" />
            <View style={styles.matchRow}>
              <View style={styles.team}>
                <View style={styles.teamCircle}>
                  <Text style={styles.teamText}>FCN</Text>
                </View>
              </View>
              <Text style={styles.vs}>VS</Text>
              <View style={styles.team}>
                <View style={styles.teamCircle}>
                  <Text style={styles.teamText}>BRØ</Text>
                </View>
              </View>
            </View>
            <Text style={styles.eventTitle}>{match.title}</Text>
            <View style={styles.detailRow}>
              <Ionicons name="calendar" size={16} color={colors.subtext} />
              <Text style={styles.detailText}>{match.date} kl. {match.time}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={16} color={colors.subtext} />
              <Text style={styles.detailText}>{match.venue}</Text>
            </View>
            <PrimaryButton title="Se detaljer" onPress={() => navigateToMatchDetails(match.id)} />
          </Card>
        ))}

        {/* Bus Trips */}
        {trips.map(trip => (
          <Card key={trip.id} style={styles.eventCard}>
            <Pill label="BUSTUR" variant="orange" />
            <Text style={styles.eventTitle}>{trip.title}</Text>
            <View style={styles.detailRow}>
              <Ionicons name="calendar" size={16} color={colors.subtext} />
              <Text style={styles.detailText}>{trip.date} kl. {trip.departure}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={16} color={colors.subtext} />
              <Text style={styles.detailText}>{trip.location}</Text>
            </View>
            <Text style={styles.spotsLeft}>{trip.spotsLeft} pladser tilbage</Text>
            <PrimaryButton title="Book plads" onPress={() => navigateToBusTripDetails(trip.id)} />
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
  },
  eventCard: {
    marginBottom: spacing.md,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  team: {
    alignItems: 'center',
  },
  teamCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  vs: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.md,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: colors.subtext,
    marginLeft: spacing.sm,
  },
  spotsLeft: {
    fontSize: 14,
    color: colors.warningText,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
});