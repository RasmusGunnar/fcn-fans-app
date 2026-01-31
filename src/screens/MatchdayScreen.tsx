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
import { useTheme } from '../theme';

export default function MatchdayScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const styles = createStyles(theme);

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
    <Pressable 
      style={[
        styles.card, 
        { 
          backgroundColor: theme.colors.bg.card, 
          borderColor: theme.colors.border.default 
        }
      ]} 
      onPress={() => nav.navigate('MatchDetails', { fixtureId: item.id })}
    >
      <View style={styles.matchRow}>
        <View style={styles.teamContainer}>
          {item.home_logo_url ? (
            <Image source={{ uri: item.home_logo_url }} style={styles.teamLogo} />
          ) : (
            <View style={[styles.teamCircle, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.teamInitials, { color: theme.colors.bg.card }]}>
                {item.home_team.substring(0, 3).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.teamName, { color: theme.colors.text.primary }]} numberOfLines={1}>
            {item.home_team}
          </Text>
        </View>

        <View style={styles.vsContainer}>
          <Text style={[styles.vs, { color: theme.colors.text.primary }]}>VS</Text>
        </View>

        <View style={styles.teamContainer}>
          {item.away_logo_url ? (
            <Image source={{ uri: item.away_logo_url }} style={styles.teamLogo} />
          ) : (
            <View style={[styles.teamCircle, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.teamInitials, { color: theme.colors.bg.card }]}>
                {item.away_team.substring(0, 3).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.teamName, { color: theme.colors.text.primary }]} numberOfLines={1}>
            {item.away_team}
          </Text>
        </View>
      </View>

      <View style={[styles.detailsContainer, { borderTopColor: theme.colors.border.default }]}>
        <Text style={[styles.dateText, { color: theme.colors.text.primary }]}>
          📅 {formatShortDateDa(item.kickoff_at)}, kl. {formatTime(item.kickoff_at)}
        </Text>
        {item.venue && (
          <Text style={[styles.venueText, { color: theme.colors.text.secondary }]}>
            🏟️ {item.venue}
            {item.venue_city ? `, ${item.venue_city}` : ''}
          </Text>
        )}
        {item.competition && (
          <Text style={[styles.competitionText, { color: theme.colors.text.secondary }]}>
            🏆 {item.competition}
            {item.round ? ` - ${item.round}` : ''}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg.default }]}>
      <Text style={[styles.h1, { color: theme.colors.text.primary }]}>Kommende Kampe</Text>

      <FlatList
        data={fixtures}
        keyExtractor={(item) => item.id}
        renderItem={renderFixture}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadFixtures}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.colors.text.primary }]}>Ingen kommende kampe endnu</Text>
            <Text style={[styles.emptySubtext, { color: theme.colors.text.secondary }]}>Tjek tilbage senere</Text>
          </View>
        }
        contentContainerStyle={fixtures.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
  },
  h1: {
    fontSize: theme.typography.h1.fontSize,
    fontWeight: theme.typography.h1.fontWeight as any,
    marginBottom: spacing.lg,
  },
  card: {
    borderWidth: theme.layout.borderWidth,
    borderRadius: theme.radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
  },
  teamCircle: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  teamName: {
    fontSize: theme.typography.small.fontSize,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: spacing.sm,
  },
  vs: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  detailsContainer: {
    borderTopWidth: theme.layout.borderWidth,
    paddingTop: spacing.sm,
  },
  dateText: {
    fontSize: theme.typography.small.fontSize,
    marginBottom: spacing.xs,
  },
  venueText: {
    fontSize: theme.typography.small.fontSize,
    marginBottom: spacing.xs,
  },
  competitionText: {
    fontSize: theme.typography.small.fontSize,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.body.fontSize,
  },
  emptyList: {
    flexGrow: 1,
  },
});
