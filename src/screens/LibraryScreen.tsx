import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SongsView } from '../components/views/SongsView';
import { LinksView as LinksViewComponent } from '../components/views/LinksView';
import { VideosView as VideosViewComponent } from '../components/views/VideosView';
import { defaultTheme } from '../theme';

const theme = defaultTheme;

type LibrarySegmentKey = 'songs' | 'standings' | 'links' | 'videos';

const segments = [
  { key: 'songs', label: 'Sange' },
  { key: 'standings', label: 'Stillingen' },
  { key: 'links', label: 'Fan Links' },
  { key: 'videos', label: 'Videoer' },
] as const satisfies ReadonlyArray<{ key: LibrarySegmentKey; label: string }>;

function StandingsView() {
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
    paddingHorizontal: theme.spacing[4],
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
});
