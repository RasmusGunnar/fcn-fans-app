import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { SongAccordionCard } from '../songs/SongAccordionCard';
import { SongEditModal } from '../songs/SongEditModal';
import { SongSuggestCard } from '../songs/SongSuggestCard';
import { fetchSongs, updateSong } from '../../services/songsApi';
import { defaultTheme } from '../../theme';
import { SONG_CATEGORY_LABELS, type Song } from '../../types/song';

const theme = defaultTheme;

export interface SongsViewProps {
  paddingBottom?: number;
}

function SongSection({
  title,
  songs,
  expandedSongId,
  onToggle,
  canEdit,
  onEdit,
}: {
  title: string;
  songs: Song[];
  expandedSongId: string | null;
  onToggle: (songId: string) => void;
  canEdit: boolean;
  onEdit: (song: Song) => void;
}) {
  if (songs.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.emptySection}>
          <Text style={styles.emptySectionText}>Ingen sange endnu.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {songs.map((song) => (
        <View key={song.id} style={styles.card}>
          <SongAccordionCard
            title={song.title}
            lyrics={song.lyrics}
            spotifyUrl={song.spotifyUrl ?? undefined}
            isExpanded={expandedSongId === song.id}
            onToggle={() => onToggle(song.id)}
            canEdit={canEdit}
            onPressEdit={() => onEdit(song)}
          />
        </View>
      ))}
    </View>
  );
}

export function SongsView({ paddingBottom = 0 }: SongsViewProps) {
  const navigation = useNavigation();
  const { isAppAdmin } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'remote' | 'fallback'>('remote');
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSongs = async () => {
      setLoading(true);
      const result = await fetchSongs();
      if (!mounted) return;
      setSongs(result.songs);
      setSource(result.source);
      setLoading(false);
    };

    void loadSongs();

    return () => {
      mounted = false;
    };
  }, []);

  const chants = useMemo(
    () => songs.filter((song) => song.category === 'slagsang'),
    [songs],
  );
  const playerSongs = useMemo(
    () => songs.filter((song) => song.category === 'spillersang'),
    [songs],
  );

  const canEditSongs = isAppAdmin && source === 'remote';

  const toggleSong = (songId: string) => {
    setExpandedSongId((current) => (current === songId ? null : songId));
  };

  const handleSuggestSong = () => {
    (navigation as any).navigate('Create');
  };

  const handleSaveSong = async (values: {
    title: string;
    lyrics: string;
    category: Song['category'];
  }) => {
    if (!editingSong) return;

    try {
      setSaving(true);
      const updatedSong = await updateSong(editingSong.id, values);
      setSongs((current) =>
        current.map((song) => (song.id === updatedSong.id ? updatedSong : song)),
      );
      setEditingSong(updatedSong);
      Alert.alert('Succes', 'Sangen er opdateret.');
      setEditingSong(null);
    } catch (error: any) {
      Alert.alert('Fejl', error?.message ?? 'Kunne ikke gemme sangen.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingState, paddingBottom > 0 && { paddingBottom }]}>
        <ActivityIndicator size="small" color={theme.colors.brand.accent} />
        <Text style={styles.loadingText}>Henter sange...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, paddingBottom > 0 && { paddingBottom }]}>
      <SongSection
        title={SONG_CATEGORY_LABELS.slagsang}
        songs={chants}
        expandedSongId={expandedSongId}
        onToggle={toggleSong}
        canEdit={canEditSongs}
        onEdit={setEditingSong}
      />

      <SongSection
        title={SONG_CATEGORY_LABELS.spillersang}
        songs={playerSongs}
        expandedSongId={expandedSongId}
        onToggle={toggleSong}
        canEdit={canEditSongs}
        onEdit={setEditingSong}
      />

      <View style={styles.card}>
        <SongSuggestCard onPressSuggest={handleSuggestSong} />
      </View>

      <SongEditModal
        visible={!!editingSong}
        song={editingSong}
        saving={saving}
        onClose={() => {
          if (!saving) setEditingSong(null);
        }}
        onSave={handleSaveSong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[5],
  },
  loadingState: {
    paddingTop: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  loadingText: {
    ...theme.typography.small,
    color: theme.colors.text.secondary,
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text.primary,
  },
  emptySection: {
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    backgroundColor: theme.colors.bg.surface,
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.border.default,
  },
  emptySectionText: {
    ...theme.typography.small,
    color: theme.colors.text.secondary,
  },
  card: {
    width: '100%',
  },
});
