import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { getMyCommunityRoleByName, WILD_TIGERS_COMMUNITY_NAME } from '../../services/rbac';
import { deleteSong, fetchSongs, updateSong } from '../../services/songsApi';
import { defaultTheme } from '../../theme';
import { SONG_CATEGORY_LABELS, type Song } from '../../types/song';
import { canEditSongs as canEditSongsPermission } from '../../utils/permissions';
import { SongAccordionCard } from '../songs/SongAccordionCard';
import { SongEditModal } from '../songs/SongEditModal';
import { SongReaderModal } from '../songs/SongReaderModal';
import { SongSuggestCard } from '../songs/SongSuggestCard';

const theme = defaultTheme;

function isValidSpotifyUrl(value: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return /^(https?:\/\/(open\.)?spotify\.com\/|spotify:)/i.test(trimmed);
}

export interface SongsViewProps {
  paddingBottom?: number;
}

function SongSection({
  title,
  songs,
  expandedSongId,
  onToggle,
  onOpenReader,
  canEdit,
  onEdit,
  onDelete,
}: {
  title: string;
  songs: Song[];
  expandedSongId: string | null;
  onToggle: (songId: string) => void;
  onOpenReader: (song: Song) => void;
  canEdit: boolean;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
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
            onOpenReader={() => onOpenReader(song)}
            canEdit={canEdit}
            onPressEdit={() => onEdit(song)}
            onPressDelete={() => onDelete(song)}
          />
        </View>
      ))}
    </View>
  );
}

export function SongsView({ paddingBottom = 0 }: SongsViewProps) {
  const navigation = useNavigation();
  const { isAppAdmin, user } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'remote' | 'fallback'>('remote');
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [readingSong, setReadingSong] = useState<Song | null>(null);
  const [activeFilter, setActiveFilter] = useState<Song['category']>('slagsang');
  const [saving, setSaving] = useState(false);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [wildTigersRole, setWildTigersRole] = useState<'owner' | 'admin' | 'member' | null>(null);

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

  useEffect(() => {
    let mounted = true;

    const loadWildTigersRole = async () => {
      if (loading) {
        return;
      }

      if (!user?.id || source !== 'remote' || isAppAdmin) {
        if (mounted) {
          setWildTigersRole(null);
        }
        return;
      }

      const role = await getMyCommunityRoleByName(WILD_TIGERS_COMMUNITY_NAME);
      if (mounted) {
        setWildTigersRole(role);
      }
    };

    void loadWildTigersRole();

    return () => {
      mounted = false;
    };
  }, [isAppAdmin, loading, source, user?.id]);

  const chants = useMemo(
    () => songs.filter((song) => song.category === 'slagsang'),
    [songs],
  );
  const playerSongs = useMemo(
    () => songs.filter((song) => song.category === 'spillersang'),
    [songs],
  );

  const canEditSongs =
    source === 'remote' && canEditSongsPermission(isAppAdmin, wildTigersRole);
  const activeSongs = activeFilter === 'slagsang' ? chants : playerSongs;

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
    spotifyUrl: string | null;
  }) => {
    if (!editingSong) return;
    if (!isValidSpotifyUrl(values.spotifyUrl)) {
      Alert.alert('Fejl', 'Indtast et gyldigt Spotify-link.');
      return;
    }

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

  const performDeleteSong = async (song: Song) => {
    try {
      setDeletingSongId(song.id);
      await deleteSong(song.id);
      setSongs((current) => current.filter((item) => item.id !== song.id));
      setExpandedSongId((current) => (current === song.id ? null : current));
      setEditingSong((current) => (current?.id === song.id ? null : current));
      setReadingSong((current) => (current?.id === song.id ? null : current));
    } catch (error: any) {
      Alert.alert('Fejl', error?.message ?? 'Kunne ikke slette sangen.');
    } finally {
      setDeletingSongId(null);
    }
  };

  const handleDeleteSong = (song: Song) => {
    if (!canEditSongs || deletingSongId) return;

    Alert.alert('Slet sang', `Vil du slette "${song.title}"?`, [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: () => {
          void performDeleteSong(song);
        },
      },
    ]);
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
      <View style={styles.filterRow}>
        {(['slagsang', 'spillersang'] as const).map((category) => {
          const isActive = activeFilter === category;
          return (
            <Pressable
              key={category}
              onPress={() => setActiveFilter(category)}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {SONG_CATEGORY_LABELS[category]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SongSection
        title={SONG_CATEGORY_LABELS[activeFilter]}
        songs={activeSongs}
        expandedSongId={expandedSongId}
        onToggle={toggleSong}
        onOpenReader={setReadingSong}
        canEdit={canEditSongs}
        onEdit={setEditingSong}
        onDelete={handleDeleteSong}
      />

      <View style={styles.card}>
        <SongSuggestCard onPressSuggest={handleSuggestSong} />
      </View>

      <SongEditModal
        visible={!!editingSong}
        song={editingSong}
        saving={saving || deletingSongId !== null}
        onClose={() => {
          if (!saving && deletingSongId === null) setEditingSong(null);
        }}
        onSave={handleSaveSong}
      />
      <SongReaderModal
        visible={!!readingSong}
        song={readingSong}
        onClose={() => setReadingSong(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[5],
  },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  filterPill: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.pill.red.bg,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.pill.red.text,
  },
  filterPillActive: {
    backgroundColor: theme.colors.brand.accent,
    borderColor: theme.colors.brand.accent,
  },
  filterText: {
    ...theme.typography.small,
    color: theme.colors.pill.red.text,
  },
  filterTextActive: {
    color: theme.colors.text.inverse,
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
