import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, Text } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { SongsView } from '../components/views/SongsView';
import { LinksView as LinksViewComponent } from '../components/views/LinksView';
import { VideosView as VideosViewComponent } from '../components/views/VideosView';
import { defaultTheme } from '../theme';

const theme = defaultTheme;

type LibrarySegmentKey = 'songs' | 'standings' | 'links' | 'videos';

const segments: { key: LibrarySegmentKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'songs', label: 'Sange', icon: 'musical-note' },
  { key: 'standings', label: 'Stillingen', icon: 'trophy' },
  { key: 'links', label: 'Fan Links', icon: 'link' },
  { key: 'videos', label: 'Videoer', icon: 'videocam' },
];

function StandingsView() {
  return (
    <Card style={styles.comingSoonCard}>
      <View style={styles.comingSoonContent}>
        <Ionicons name="trophy" size={theme.spacing[12]} color={theme.colors.brand.accent} />
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentRow}
      >
        {segments.map((segment) => {
          const isActive = segment.key === activeSegment;
          return (
            <Pressable
              key={segment.key}
              onPress={() => handleSegmentPress(segment.key)}
              style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
            >
              <View style={styles.segmentContent}>
                <Ionicons
                  name={segment.icon}
                  size={theme.components.icon.size.sm}
                  color={isActive ? theme.colors.text.inverse : theme.colors.text.primary}
                />
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {segment.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

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
  segmentRow: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  segmentButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.pill,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.bg.default,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.brand.accent,
    borderColor: theme.colors.brand.accent,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  segmentText: {
    color: theme.colors.text.primary,
    ...theme.typography.caption,
  },
  segmentTextActive: {
    color: theme.colors.text.inverse,
    ...theme.typography.caption,
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
