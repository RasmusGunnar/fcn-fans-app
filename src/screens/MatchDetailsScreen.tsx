import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { OutlineButton } from '../components/ui/OutlineButton';
import { SectionTitle } from '../components/ui/SectionTitle';
import { ListRowIcon } from '../components/ui/ListRowIcon';
import { colors, spacing } from '../theme';

type MatchDetailsRouteProp = RouteProp<{ MatchDetails: { matchId: string } }, 'MatchDetails'>;

export default function MatchDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<MatchDetailsRouteProp>();
  const { matchId } = route.params || { matchId: 'match-1' };
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </Pressable>
        <Text style={styles.headerTitle}>Kampdetaljer</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      >
        {/* Match Card */}
        <Card style={styles.matchCard}>
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
          <Text style={styles.leagueText}>Superligaen - Runde 18</Text>
          <View style={styles.divider} />
          <ListRowIcon icon="calendar" title="Lørdag 18. januar 2025, 14:00" />
          <ListRowIcon icon="location" title="Right to Dream Park" subtitle="Farum" />
          <ListRowIcon icon="people" title="247 deltagere" />
        </Card>

        {/* CTA Buttons */}
        <View style={styles.ctaRow}>
          <View style={styles.ctaButton}>
            <PrimaryButton title="Køb billet" onPress={() => console.log('Buy ticket')} />
          </View>
          <View style={styles.ctaButton}>
            <OutlineButton title="Rutevejledning" onPress={() => console.log('Route')} />
          </View>
        </View>

        {/* Join CTA */}
        <Pressable style={styles.joinCta}>
          <Ionicons name="person-add" size={24} color={colors.fcnRed} />
          <Text style={styles.joinText}>Deltag (247)</Text>
        </Pressable>

        {/* Fan Activities */}
        <View style={styles.section}>
          <SectionTitle title="FAN AKTIVITETER" />
          <Card style={styles.activitiesCard}>
            <ListRowIcon icon="bus" title="Bustur til Brøndby" subtitle="18. januar 2025" />
            <ListRowIcon icon="restaurant" title="Fælles frokost" subtitle="Før kampen" />
          </Card>
        </View>

        {/* Fan Comments */}
        <View style={styles.section}>
          <SectionTitle title="FRA FANS OM DENNE KAMP" />
          <Card style={styles.commentsCard}>
            <View style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={styles.commentAuthor}>Morten Hansen</Text>
                <Text style={styles.commentText}>Glæder mig til at se FCN vinde!</Text>
              </View>
            </View>
            <View style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>S</Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={styles.commentAuthor}>Sarah Jensen</Text>
                <Text style={styles.commentText}>Kommer med toget fra København</Text>
              </View>
            </View>
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
  matchCard: {
    margin: spacing.md,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamText: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '700',
  },
  vs: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.md,
  },
  leagueText: {
    fontSize: 16,
    color: colors.subtext,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  ctaButton: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  joinCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.fcnRed,
    borderRadius: spacing.md,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  joinText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.fcnRed,
    marginLeft: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  activitiesCard: {
    marginBottom: spacing.md,
  },
  commentsCard: {
    marginBottom: spacing.md,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
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
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  commentText: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 2,
  },
});