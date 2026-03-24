import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { LinksView as LinksViewComponent } from '../components/views/LinksView';
import { SongsView } from '../components/views/SongsView';
import { VideosView as VideosViewComponent } from '../components/views/VideosView';
import { supabase } from '../lib/supabase';
import { defaultTheme } from '../theme';
import { buildStandingsSections, type StandingsRow } from '../utils/standings';

const theme = defaultTheme;

declare const process: {
  env: {
    EXPO_PUBLIC_SPORTSDB_LEAGUE_ID?: string;
    EXPO_PUBLIC_SPORTSDB_SEASON?: string;
  };
};

const STANDINGS_LEAGUE_ID = process.env.EXPO_PUBLIC_SPORTSDB_LEAGUE_ID ?? '4340';
const STANDINGS_SEASON = process.env.EXPO_PUBLIC_SPORTSDB_SEASON ?? '2025-2026';

type LibrarySegmentKey = 'songs' | 'standings' | 'links' | 'videos';

const segments = [
  { key: 'songs', label: 'Sange' },
  { key: 'standings', label: 'Stillingen' },
  { key: 'links', label: 'Links' },
  { key: 'videos', label: 'Videoer' },
] as const satisfies readonly { key: LibrarySegmentKey; label: string }[];

function normalizeTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¥/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isFcnTeam(name: string): boolean {
  return normalizeTeamName(name).includes('nordsjaelland');
}

function StandingsTableSection({
  rows,
  title,
}: {
  rows: StandingsRow[];
  title?: string;
}) {
  return (
    <View style={styles.standingsSection}>
      {title ? <Text style={styles.standingsSectionTitle}>{title}</Text> : null}

      <View style={styles.standingsTable}>
        <View style={[styles.standingsRow, styles.standingsRowHeader]}>
          <Text style={[styles.standingsCell, styles.cellRank]}>#</Text>
          <Text style={[styles.standingsCell, styles.cellTeam]}>Hold</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>K</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>V</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>U</Text>
          <Text style={[styles.standingsCell, styles.cellStat]}>T</Text>
          <Text style={[styles.standingsCell, styles.cellGoals]}>Mål</Text>
          <Text style={[styles.standingsCell, styles.cellPoints]}>P</Text>
        </View>

        {rows.map((row, index) => {
          const name = row.teamName ?? '';
          const isFcn = isFcnTeam(name);

          return (
            <View
              key={`${row.teamId ?? name}-${index}`}
              style={[styles.standingsRow, isFcn && styles.standingsRowHighlight]}
            >
              {isFcn ? <View style={styles.standingsRowAccent} /> : null}

              <Text
                style={[
                  styles.standingsCell,
                  styles.cellRank,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
              >
                {row.rank ?? '-'}
              </Text>

              <View style={styles.teamCell}>
                {row.teamBadge ? (
                  <Image source={{ uri: row.teamBadge }} style={styles.teamBadge} />
                ) : null}
                <Text
                  style={[
                    styles.standingsCell,
                    styles.cellTeam,
                    isFcn && styles.standingsCellHighlight,
                    isFcn && styles.standingsHighlightTeam,
                  ]}
                  numberOfLines={1}
                >
                  {name || '-'}
                </Text>
              </View>

              <Text
                style={[
                  styles.standingsCell,
                  styles.cellStat,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
              >
                {row.played ?? '-'}
              </Text>
              <Text
                style={[
                  styles.standingsCell,
                  styles.cellStat,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
              >
                {row.wins ?? '-'}
              </Text>
              <Text
                style={[
                  styles.standingsCell,
                  styles.cellStat,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
              >
                {row.draws ?? '-'}
              </Text>
              <Text
                style={[
                  styles.standingsCell,
                  styles.cellStat,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
              >
                {row.losses ?? '-'}
              </Text>
              <Text
                style={[
                  styles.standingsCell,
                  styles.cellGoals,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightStat,
                ]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {row.gf != null && row.ga != null ? `${row.gf}-${row.ga}` : '-'}
              </Text>
              <Text
                style={[
                  styles.standingsCell,
                  styles.cellPoints,
                  styles.standingsPointsCell,
                  isFcn && styles.standingsCellHighlight,
                  isFcn && styles.standingsHighlightPoints,
                ]}
              >
                {row.points ?? '-'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StandingsView() {
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadStandings = async () => {
      const { data, error } = await supabase
        .from('standings_cache')
        .select('rows, updated_at, league_id, season')
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

    void loadStandings();

    return () => {
      isActive = false;
    };
  }, []);

  if (!hasData) {
    return (
      <Card style={styles.comingSoonCard}>
        <View style={styles.comingSoonContent}>
          <View style={styles.comingSoonIconWrap}>
            <Ionicons
              name="trophy-outline"
              size={theme.components.icon.size.lg}
              color={theme.colors.brand.accent}
            />
          </View>
          <Badge label="Superligaen" variant="brandSoft" size="sm" />
          <Text style={styles.comingSoonTitle}>Stillingen opdateres</Text>
          <Text style={styles.comingSoonSubtitle}>Vi henter de nyeste tal fra ligaen.</Text>
          <Text style={styles.comingSoonSecondary}>Prøv igen senere.</Text>
        </View>
      </Card>
    );
  }

  const sections = buildStandingsSections(rows);

  return (
    <Card style={styles.standingsCard}>
      <View style={styles.standingsHeader}>
        <Text style={styles.standingsTitle}>Superligaen</Text>
        <Text style={styles.standingsSubtitle}>Stillingen</Text>
      </View>

      <View style={styles.standingsSections}>
        {sections.mode === 'single' ? (
          <StandingsTableSection rows={sections.singleRows} />
        ) : (
          <>
            <StandingsTableSection title="Mesterskabsspil" rows={sections.championshipRows} />
            <StandingsTableSection title="Nedrykningsspil" rows={sections.relegationRows} />
          </>
        )}
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

      <SegmentedControl items={segments} activeKey={activeSegment} onChange={handleSegmentPress} />

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
  comingSoonIconWrap: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.subtle,
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.border.default,
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
  standingsSections: {
    padding: theme.components.card.padding,
    gap: theme.spacing[3],
  },
  standingsSection: {
    gap: theme.spacing[2],
  },
  standingsSectionTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
    paddingHorizontal: theme.spacing[1],
  },
  standingsTable: {
    gap: theme.spacing[1],
  },
  standingsRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[1] - theme.layout.borderHairline,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg.surface,
  },
  standingsRowHeader: {
    backgroundColor: theme.colors.bg.subtle,
  },
  standingsRowHighlight: {
    backgroundColor: theme.colors.pill.red.bg,
  },
  standingsRowAccent: {
    position: 'absolute',
    left: theme.spacing[2],
    top: theme.spacing[1],
    bottom: theme.spacing[1],
    width: theme.spacing[1],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand.accent,
  },
  standingsCell: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  standingsCellHighlight: {
    color: theme.colors.text.primary,
  },
  standingsHighlightTeam: {
    ...theme.typography.bodyBold,
  },
  standingsHighlightStat: {
    ...theme.typography.small,
  },
  standingsHighlightPoints: {
    ...theme.typography.caption,
    fontWeight: '700',
  },
  standingsPointsCell: {
    ...theme.typography.caption,
    fontWeight: '600',
  },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    minWidth: 0,
  },
  teamBadge: {
    width: theme.spacing[5],
    height: theme.spacing[5],
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bg.subtle,
  },
  cellRank: {
    width: theme.spacing[6],
    marginRight: theme.spacing[1],
    textAlign: 'right',
  },
  cellTeam: {
    flex: 1,
    textAlign: 'left',
  },
  cellStat: {
    width: theme.spacing[5],
    textAlign: 'right',
  },
  cellGoals: {
    width: theme.spacing[10],
    textAlign: 'right',
  },
  cellPoints: {
    width: theme.spacing[6],
    textAlign: 'right',
  },
});
