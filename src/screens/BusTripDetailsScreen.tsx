import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { OutlineButton } from '../components/ui/OutlineButton';
import { SectionTitle } from '../components/ui/SectionTitle';
import { ListRowIcon } from '../components/ui/ListRowIcon';
import { colors, spacing } from '../theme';

type BusTripDetailsRouteProp = RouteProp<{ BusTripDetails: { tripId: string } }, 'BusTripDetails'>;

export default function BusTripDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<BusTripDetailsRouteProp>();
  const { tripId } = route.params || { tripId: 'trip-1' };
  const tabBarHeight = useBottomTabBarHeight();

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
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      >
        {/* Trip Details Card */}
        <Card style={styles.detailsCard}>
          <Pill label="BUSTUR TIL UDEKAMP" variant="orange" />
          <Text style={styles.tripTitle}>Bustur til Silkeborg</Text>
          <ListRowIcon icon="calendar" title="Lørdag 18. januar 2025" subtitle="14:00 afgang" />
          <ListRowIcon icon="location" title="Farum Station" subtitle="Mødested" />
          <ListRowIcon icon="time" title="Forventet hjemkomst 22:00" />
          <ListRowIcon icon="people" title="12 pladser tilbage" />
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.price}>250 kr.</Text>
            <Text style={styles.priceNote}>pr. person</Text>
          </View>
          <Text style={styles.priceSubNote}>Inkl. transport og entré</Text>
        </Card>

        {/* Book Button */}
        <View style={styles.bookSection}>
          <PrimaryButton title="Book plads nu" onPress={() => console.log('Book trip')} />
        </View>

        {/* What's Included */}
        <View style={styles.section}>
          <SectionTitle title="HVAD ER INKLUDERET?" />
          <Card style={styles.includedCard}>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.fcnRed} />
              <Text style={styles.bulletText}>Bus transport tur/retur</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.fcnRed} />
              <Text style={styles.bulletText}>Entrébillet til kampen</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.fcnRed} />
              <Text style={styles.bulletText}>Fælles oplevelse med fans</Text>
            </View>
          </Card>
        </View>

        {/* Organizer */}
        <View style={styles.section}>
          <SectionTitle title="ARRANGØR" />
          <Card style={styles.organizerCard}>
            <View style={styles.organizerHeader}>
              <View style={styles.organizerAvatar}>
                <Ionicons name="people-circle" size={40} color={colors.fcnRed} />
              </View>
              <View style={styles.organizerInfo}>
                <Text style={styles.organizerName}>Farum Fans</Text>
                <Text style={styles.organizerMeta}>156 medlemmer • Arrangerer busture</Text>
              </View>
            </View>
            <View style={styles.organizerActions}>
              <OutlineButton title="Kontakt" onPress={() => console.log('Contact')} />
              <OutlineButton title="Besked" onPress={() => console.log('Message')} />
            </View>
          </Card>
        </View>

        {/* Participants */}
        <View style={styles.section}>
          <SectionTitle title="DELTAGERE (38)" />
          <Card style={styles.participantsCard}>
            <View style={styles.avatarsRow}>
              {['M', 'S', 'J', 'L', 'A'].map((initial, index) => (
                <View key={index} style={styles.participantAvatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.participantsText}>Morten, Sarah, Jens, Lars, Anne og 33 andre</Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.fcnRed,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.card,
  },
  scrollView: {
    flex: 1,
  },
  detailsCard: {
    margin: spacing.md,
  },
  tripTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.fcnRed,
  },
  priceNote: {
    fontSize: 16,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  priceSubNote: {
    fontSize: 12,
    color: colors.subtext,
  },
  bookSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  includedCard: {
    marginBottom: spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bulletText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  organizerCard: {
    marginBottom: spacing.md,
  },
  organizerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  organizerAvatar: {
    marginRight: spacing.sm,
  },
  organizerInfo: {
    flex: 1,
  },
  organizerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  organizerMeta: {
    fontSize: 14,
    color: colors.subtext,
  },
  organizerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  participantsCard: {
    marginBottom: spacing.md,
  },
  avatarsRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  participantsText: {
    fontSize: 14,
    color: colors.subtext,
  },
});