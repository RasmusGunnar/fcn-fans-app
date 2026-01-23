import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Image, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  fetchUpcomingFixtures,
  formatShortDateDa,
  formatTime,
  type Fixture,
} from '../services/fixtures';
import { colors, spacing } from '../theme';

export default function MatchdayScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFixtures = async () => {
    setLoading(true);
    const data = await fetchUpcomingFixtures(50);
    setFixtures(data);
    setLoading(false);
  };

  useEffect(() => {
    loadFixtures();
  }, []);

  const renderFixture = ({ item }: { item: Fixture }) => (
    <Pressable style={styles.card} onPress={() => nav.navigate('MatchDetails', { fixtureId: item.id })}>
      <View style={styles.matchRow}>
        <View style={styles.teamContainer}>
          {item.home_logo_url ? (
            <Image source={{ uri: item.home_logo_url }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamCircle}>
              <Text style={styles.teamInitials}>
                {item.home_team.substring(0, 3).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {item.home_team}
          </Text>
        </View>

        <View style={styles.vsContainer}>
          <Text style={styles.vs}>VS</Text>
        </View>

        <View style={styles.teamContainer}>
          {item.away_logo_url ? (
            <Image source={{ uri: item.away_logo_url }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamCircle}>
              <Text style={styles.teamInitials}>
                {item.away_team.substring(0, 3).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {item.away_team}
          </Text>
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <Text style={styles.dateText}>
          📅 {formatShortDateDa(item.kickoff_at)}, kl. {formatTime(item.kickoff_at)}
        </Text>
        {item.venue && (
          <Text style={styles.venueText}>
            🏟️ {item.venue}
            {item.venue_city ? `, ${item.venue_city}` : ''}
          </Text>
        )}
        {item.competition && (
          <Text style={styles.competitionText}>
            🏆 {item.competition}
            {item.round ? ` - ${item.round}` : ''}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Kommende Kampe</Text>

      <FlatList
        data={fixtures}
        keyExtractor={(item) => item.id}
        renderItem={renderFixture}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadFixtures}
            tintColor={colors.fcnRed}
            colors={[colors.fcnRed]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Ingen kommende kampe endnu</Text>
            <Text style={styles.emptySubtext}>Tjek tilbage senere</Text>
          </View>
        }
        contentContainerStyle={fixtures.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  h1: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border || '#e0e0e0',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  teamCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '700',
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: spacing.sm,
  },
  vs: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  detailsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border || '#e0e0e0',
    paddingTop: spacing.sm,
  },
  dateText: {
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  venueText: {
    fontSize: 13,
    color: colors.subtext,
    marginBottom: spacing.xs,
  },
  competitionText: {
    fontSize: 13,
    color: colors.subtext,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.subtext,
  },
  emptyList: {
    flexGrow: 1,
  },
});
