import React from 'react';
import { View, Pressable, Text, StyleSheet, Image, Linking, Alert, ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { defaultTheme } from '../../theme';

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
    id: 'fcn-highlights-2025',
    title: 'FCN Highlights 2024/25',
    description: 'Sæsonens bedste øjeblikke',
    url: 'https://youtube.com/results?search_query=FC+Nordsjælland+highlights',
    year: '2025',
    tag: 'Highlights',
    thumbnail: undefined,
  },
  {
    id: 'fcn-match-vs-br',
    title: 'FCN vs Brøndby',
    description: 'Superligakamp - fuld kamp',
    url: 'https://youtube.com/results?search_query=FC+Nordsjælland+vs+Brøndby',
    year: '2025',
    tag: 'Kamp',
    thumbnail: undefined,
  },
  {
    id: 'fcn-interview',
    title: 'Tränerin interview',
    description: 'Eksklusiv samtale om sæsonen',
    url: 'https://youtube.com',
    year: '2025',
    tag: 'Interview',
    thumbnail: undefined,
  },
  {
    id: 'fcn-academy',
    title: 'FCN Akademi',
    description: 'Unge talenter i træning',
    url: 'https://youtube.com',
    year: '2024',
    tag: 'Akademi',
    thumbnail: undefined,
  },
  {
    id: 'fcn-supporters',
    title: 'Fans celebration',
    description: 'FCN supporters højdepunkter',
    url: 'https://youtube.com',
    year: '2024',
    tag: 'Fans',
    thumbnail: undefined,
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
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke åbne videoen.');
    }
  };

  const tagColor =
    video.tag === 'Highlights'
      ? theme.colors.brand.accent
      : video.tag === 'Kamp'
        ? theme.colors.error
        : video.tag === 'Interview'
          ? theme.colors.info
          : video.tag === 'Akademi'
            ? theme.colors.warning
            : theme.colors.brand.accent;

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
              {video.tag && (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: tagColor, opacity: 0.15 },
                  ]}
                >
                  <Text style={[styles.tagText, { color: tagColor }]}>
                    {video.tag}
                  </Text>
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
            <Ionicons name="play-circle-outline" size={theme.spacing[12]} color={theme.colors.text.secondary} />
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
  },
  card: {
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
