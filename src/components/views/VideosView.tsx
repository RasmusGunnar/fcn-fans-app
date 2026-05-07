import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Alert,
  Image,
  ImageSourcePropType,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { defaultTheme } from '../../theme';
import { Card } from '../ui/Card';

const theme = defaultTheme;

interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  year?: string;
  tag?: string;
  thumbnail?: ImageSourcePropType;
}

const videos: Video[] = [
  {
    id: 'caleb-yirenkyi-skills-2026',
    title: 'Caleb Yirenkyi: mål og assists',
    description: 'Højdepunkter med det unge FCN-talent: teknik, mål og oplæg.',
    url: 'https://www.youtube.com/watch?v=Wg7VZXVpxKA',
    year: '2026',
    tag: 'Spiller',
    thumbnail: { uri: 'https://i.ytimg.com/vi/Wg7VZXVpxKA/hqdefault.jpg' },
  },
  {
    id: 'fcn-talentfabrik-2026',
    title: 'Sådan skaber FCN talenter',
    description: 'Bold ser på, hvorfor FCN igen og igen udvikler store talenter.',
    url: 'https://www.youtube.com/watch?v=7sNH5dVFGpI',
    year: '2026',
    tag: 'Akademi',
    thumbnail: { uri: 'https://i.ytimg.com/vi/7sNH5dVFGpI/hqdefault.jpg' },
  },
  {
    id: 'fcn-beholdt-stjernerne-2026',
    title: 'Hvis FCN beholdt stjernerne',
    description: 'Et bud på FCN-holdet, hvis tidligere profiler stadig var samlet.',
    url: 'https://www.youtube.com/watch?v=xGTK_fEK7Ow',
    year: '2026',
    tag: 'Analyse',
    thumbnail: { uri: 'https://i.ytimg.com/vi/xGTK_fEK7Ow/hqdefault.jpg' },
  },
  {
    id: 'fcn-fan-for-en-dag-2025',
    title: 'FCN-fan for en dag',
    description: 'Mandsholdet besøger Farum og mærker stemningen som FCN-fan.',
    url: 'https://www.youtube.com/watch?v=9svVpyAt8ZU',
    year: '2025',
    tag: 'Fans',
    thumbnail: { uri: 'https://i.ytimg.com/vi/9svVpyAt8ZU/hqdefault.jpg' },
  },
  {
    id: 'mesterskab-2012',
    title: 'Mesterskabskampen – guld 2012',
    description: 'FCN sikrer mesterskabet med 3-0 over AC Horsens.',
    url: 'https://youtu.be/7IGuaIGKg4c?si=QnxG4XttsnPXSlMJ',
    year: '2012',
    tag: 'Highlights',
    thumbnail: { uri: 'https://i.ytimg.com/vi/7IGuaIGKg4c/hqdefault.jpg' },
  },
];

function VideoCard({ video }: { video: Video }) {
  const handlePress = async () => {
    try {
      const canOpen = await Linking.canOpenURL(video.url);
      if (canOpen) {
        await Linking.openURL(video.url);
      } else {
        Alert.alert('Fejl', `Kan ikke åbne video: ${video.url}`);
      }
    } catch {
      Alert.alert('Fejl', 'Kunne ikke åbne videoen.');
    }
  };

  return (
    <Pressable onPress={handlePress}>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          {video.thumbnail ? (
            <Image source={video.thumbnail} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="play" size={theme.spacing[12]} color={theme.colors.brand.accent} />
            </View>
          )}

          <View style={styles.infoSection}>
            <View style={styles.headerRow}>
              <View style={styles.titleBox}>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {video.title}
                </Text>
                <Text style={styles.videoDescription} numberOfLines={2}>
                  {video.description}
                </Text>
              </View>
              <Ionicons
                name="arrow-forward"
                size={theme.spacing[5]}
                color={theme.colors.text.secondary}
                style={styles.arrowIcon}
              />
            </View>

            <View style={styles.tagsRow}>
              {video.year && (
                <View style={[styles.tag, { backgroundColor: theme.colors.bg.subtle }]}>
                  <Text style={styles.tagText}>{video.year}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export interface VideosViewProps {
  /**
   * Optional additional spacing below content.
   * Used by parent screen to account for tab bar height.
   */
  paddingBottom?: number;
}

/**
 * VideosView: Displays a curated list of fan videos and highlights.
 * - Static array of videos (matches, highlights, interviews, academy)
 * - Card-based layout with optional thumbnails
 * - Tap to open video URL (YouTube, etc.)
 * - Uses Linking.openURL for external navigation
 */
export function VideosView({ paddingBottom = 0 }: VideosViewProps) {
  return (
    <View style={[styles.container, paddingBottom > 0 && { paddingBottom }]}>
      {videos.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyContent}>
            <Ionicons
              name="play-circle-outline"
              size={theme.spacing[12]}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.emptyText}>Ingen videoer tilgængelige</Text>
          </View>
        </Card>
      ) : (
        videos.map((video) => <VideoCard key={video.id} video={video} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  card: {
    width: '100%',
  },
  cardContent: {
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: theme.spacing[12] + theme.spacing[12] + theme.spacing[10] + theme.spacing[11],
    backgroundColor: theme.colors.bg.subtle,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: theme.spacing[12] + theme.spacing[12] + theme.spacing[10] + theme.spacing[11],
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    padding: theme.components.card.padding,
    gap: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  titleBox: {
    flex: 1,
    gap: theme.spacing[1],
  },
  videoTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  videoDescription: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  arrowIcon: {
    marginTop: theme.spacing[1],
    flexShrink: 0,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    flexWrap: 'wrap',
  },
  tag: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
  },
  tagText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  emptyCard: {
    width: '100%',
  },
  emptyContent: {
    padding: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  emptyText: {
    color: theme.colors.text.secondary,
    ...theme.typography.body,
  },
});
