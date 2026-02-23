import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Text, Image } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SongsView } from '../components/views/SongsView';
import { LinksView as LinksViewComponent } from '../components/views/LinksView';
import { VideosView as VideosViewComponent } from '../components/views/VideosView';
import { supabase } from '../lib/supabase';
import { defaultTheme } from '../theme';

const theme = defaultTheme;

declare const process: {
  env: {
    EXPO_PUBLIC_SPORTSDB_LEAGUE_ID?: string;
    EXPO_PUBLIC_SPORTSDB_SEASON?: string;
  };
};

const STANDINGS_LEAGUE_ID = process.env.EXPO_PUBLIC_SPORTSDB_LEAGUE_ID ?? '4326';
const STANDINGS_SEASON = process.env.EXPO_PUBLIC_SPORTSDB_SEASON ?? '2024-2025';

type LibrarySegmentKey = 'songs' | 'standings' | 'links' | 'videos';

const segments = [
  { key: 'songs', label: 'Sange' },
  { key: 'standings', label: 'Stillingen' },
  { key: 'links', label: 'Links' },
  { key: 'videos', label: 'Videoer' },
] as const satisfies ReadonlyArray<{ key: LibrarySegmentKey; label: string }>;

type StandingsRow = {
  rank?: number | null;
  teamName?: string | null;
  played?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  gf?: number | null;
  ga?: number | null;
  gd?: number | null;
  points?: number | null;
  teamId?: string | null;
  teamBadge?: string | null;
};

function StandingsView() {
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadStandings = async () => {
      const { data, error } = await supabase
        .from('standings_cache')
        .select('rows, updated_at')
        .eq('league_id', STANDINGS_LEAGUE_ID)
        .eq('season', STANDINGS_SEASON)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isActive) return;
      if (error || !data?.rows || data.rows.length === 0) {
        setRows([]);
        setHasData(false);
        return;
      }

      setRows(data.rows as StandingsRow[]);
      setHasData(true);
    };

    loadStandings();
    return () => {
      isActive = false;
    };
  }, []);

  if (!hasData) {
    return (
      <Card style={styles.comingSoonCard}>
        <View style={styles.comingSoonContent}>
          <Text style={styles.comingSoonTitle}>Superligaen</Text>
          <Text style={styles.comingSoonSubtitle}>Stillingen kommer snart</Text>
          <Text style={styles.comingSoonSecondary}>Vi arbejder på at hente live-data.</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.standingsCard}>
      <View style={styles.standingsHeader}>
        <Text style={styles.standingsTitle}>Superligaen</Text>
        <Text style={styles.standingsSubtitle}>Stillingen</Text>
      </View>

      <View style={styles.standingsTable}>
        <View style={[styles.standingsRow, styles.standingsRowHeader]}>
          <Text style={[styles.standingsCell, styles.cellRank]}>#</Text>
          <Text style={[styles.standingsCell, styles.cellTeam]}>Hold</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>K</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>V</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>U</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>T</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>Mål</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>P</Text>
        </View>

        {rows.map((row, index) => {
          const name = row.teamName ?? '';
          const isFcn = name.toLowerCase().includes('nordsjælland');
          return (
            <View
              key={`${row.teamId ?? name}-${index}`}
              style={[styles.standingsRow, isFcn && styles.standingsRowHighlight]}
            >
              <Text style={[styles.standingsCell, styles.cellRank, isFcn && styles.standingsCellHighlight]}>
                {row.rank ?? '-'}
              </Text>
              <View style={styles.teamCell}>
                {row.teamBadge ? (
                  <Image source={{ uri: row.teamBadge }} style={styles.teamBadge} />
                ) : null}
                <Text
                  style={[styles.standingsCell, styles.cellTeam, isFcn && styles.standingsCellHighlight]}
                  numberOfLines={1}
                >
                  {name || '-'}
                </Text>
              </View>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.played ?? '-'}
              </Text>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.wins ?? '-'}
              </Text>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.draws ?? '-'}
              </Text>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.losses ?? '-'}
              </Text>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.gf != null && row.ga != null ? `${row.gf}-${row.ga}` : '-'}
              </Text>
              <Text style={[styles.standingsCell, styles.cellStat, isFcn && styles.standingsCellHighlight]}>
                {row.points ?? '-'}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function LibraryScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const [activeSegment, setActiveSegment] = useState<LibrarySegmentKey>('songs');

  const handleSegmentPress = (segment: LibrarySegmentKey) => {
    setActiveSegment(segment);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Bibliotek" subtitle="Ressourcer til FCN fans" />

      <SegmentedControl
        items={segments}
        activeKey={activeSegment}
        onChange={handleSegmentPress}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + theme.spacing[6] }}
      >
        {activeSegment === 'songs' && <SongsView />}
        {activeSegment === 'standings' && <StandingsView />}
        {activeSegment === 'links' && <LinksViewComponent />}
        {activeSegment === 'videos' && <VideosViewComponent />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing[0],
    paddingTop: theme.spacing[2],
  },
  comingSoonCard: {
    borderRadius: theme.components.card.borderRadius,
  },
  comingSoonContent: {
    padding: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  comingSoonTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.h3,
    textAlign: 'center',
  },
  comingSoonSubtitle: {
    color: theme.colors.text.secondary,
    ...theme.typography.body,
    textAlign: 'center',
  },
  comingSoonSecondary: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  standingsCard: {
    borderRadius: theme.components.card.borderRadius,
  },
  standingsHeader: {
    paddingHorizontal: theme.components.card.padding,
    paddingTop: theme.components.card.padding,
    gap: theme.spacing[1],
  },
  standingsTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.h3,
  },
  standingsSubtitle: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  standingsTable: {
    padding: theme.components.card.padding,
    gap: theme.spacing[2],
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.md,
  },
  standingsRowHeader: {
    backgroundColor: theme.colors.bg.subtle,
  },
  standingsRowHighlight: {
    backgroundColor: theme.colors.brand.muted,
  },
  standingsCell: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  standingsCellHighlight: {
    color: theme.colors.text.primary,
  },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  teamBadge: {
    width: theme.spacing[6],
    height: theme.spacing[6],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg.subtle,
  },
  cellRank: {
    width: theme.spacing[6],
    textAlign: 'center',
  },
  cellTeam: {
    flex: 1,
  },
  cellStat: {
    width: theme.spacing[6],
    textAlign: 'center',
  },
});
