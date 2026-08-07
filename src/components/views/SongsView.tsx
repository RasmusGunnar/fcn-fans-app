import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { logger } from '../../lib/logger';
import { getMyCommunityRoleByName, WILD_TIGERS_COMMUNITY_NAME } from '../../services/rbac';
import { deleteSongAudio, SongAudioUploadError, uploadSongAudio } from '../../services/songAudio';
import {
  assertSongVersionCurrent,
  canManageWildTigersSongs,
  deleteSong,
  fetchSongs,
  SongConflictError,
  updateSong,
} from '../../services/songsApi';
import { defaultTheme } from '../../theme';
import { SONG_CATEGORY_LABELS, type Song } from '../../types/song';
import { canEditSongs as canEditSongsPermission } from '../../utils/permissions';
import {
  runSongAudioSaveSaga,
  runSongDeleteSaga,
  type SongAudioChange,
} from '../../utils/songAudio';
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

function getSongMutationErrorMessage(error: unknown, action: 'save' | 'delete'): string {
  if (error instanceof SongConflictError) {
    return 'Sangen er blevet ændret af en anden. Genindlæs og prøv igen.';
  }
  if (error instanceof SongAudioUploadError) {
    if (error.message === 'offline') {
      return 'Du er offline. Opret forbindelse, og prøv igen.';
    }
    if (error.message === 'permission_lost') {
      return 'Du har ikke længere adgang til at redigere sangbogen.';
    }
    if (error.message === 'timeout') {
      return 'Upload af lydfil tog for lang tid. Prøv igen.';
    }
    return 'Upload af lydfil mislykkedes. Prøv igen.';
  }
  return action === 'delete' ? 'Kunne ikke slette sangen.' : 'Kunne ikke gemme sangen.';
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
            hasAudio={!!song.audioPath}
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [wildTigersRole, setWildTigersRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [canManageSongsViaRpc, setCanManageSongsViaRpc] = useState<boolean | null>(null);

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

    const loadSongPermission = async () => {
      if (loading || !user?.id || source !== 'remote') {
        if (mounted) {
          setCanManageSongsViaRpc(null);
        }
        return;
      }

      const canManage = await canManageWildTigersSongs();
      if (mounted) {
        setCanManageSongsViaRpc(canManage);
      }
    };

    void loadSongPermission();

    return () => {
      mounted = false;
    };
  }, [loading, source, user?.id]);

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

  const chants = useMemo(() => songs.filter((song) => song.category === 'slagsang'), [songs]);
  const playerSongs = useMemo(
    () => songs.filter((song) => song.category === 'spillersang'),
    [songs],
  );

  const canEditSongs =
    source === 'remote' &&
    (canManageSongsViaRpc === true || canEditSongsPermission(isAppAdmin, wildTigersRole));
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
    audioChange: SongAudioChange;
  }) => {
    if (!editingSong) return;
    if (!isValidSpotifyUrl(values.spotifyUrl)) {
      Alert.alert('Fejl', 'Indtast et gyldigt Spotify-link.');
      return;
    }

    try {
      setSaving(true);
      setUploadProgress(values.audioChange.kind === 'replace' ? 0 : null);
      const canStillManage = await canManageWildTigersSongs();
      if (canStillManage !== true) {
        throw new SongAudioUploadError('permission_lost');
      }
      if (!editingSong.updatedAt) {
        throw new SongConflictError();
      }

      await assertSongVersionCurrent(editingSong.id, editingSong.updatedAt);
      const updatedSong = await runSongAudioSaveSaga({
        change: values.audioChange,
        currentAudioPath: editingSong.audioPath,
        upload: (file) => uploadSongAudio(file, setUploadProgress),
        update: (audio) => updateSong(editingSong.id, values, editingSong.updatedAt!, audio),
        deleteAudio: deleteSongAudio,
        onCleanupError: () => {
          logger.warn('[SongsView] Song audio cleanup failed after save.');
        },
      });
      setSongs((current) =>
        current.map((song) => (song.id === updatedSong.id ? updatedSong : song)),
      );
      setReadingSong((current) => (current?.id === updatedSong.id ? updatedSong : current));
      Alert.alert('Succes', 'Sangen er opdateret.');
      setEditingSong(null);
    } catch (error) {
      Alert.alert('Fejl', getSongMutationErrorMessage(error, 'save'));
    } finally {
      setUploadProgress(null);
      setSaving(false);
    }
  };

  const performDeleteSong = async (song: Song) => {
    try {
      setDeletingSongId(song.id);
      const canStillManage = await canManageWildTigersSongs();
      if (canStillManage !== true) {
        throw new SongAudioUploadError('permission_lost');
      }
      if (!song.updatedAt) {
        throw new SongConflictError();
      }

      await assertSongVersionCurrent(song.id, song.updatedAt);
      await runSongDeleteSaga({
        audioPath: song.audioPath,
        deleteSongRow: () => deleteSong(song.id, song.updatedAt!),
        deleteAudio: deleteSongAudio,
        onCleanupError: () => {
          logger.warn('[SongsView] Song audio cleanup failed after song deletion.');
        },
      });
      setSongs((current) => current.filter((item) => item.id !== song.id));
      setExpandedSongId((current) => (current === song.id ? null : current));
      setEditingSong((current) => (current?.id === song.id ? null : current));
      setReadingSong((current) => (current?.id === song.id ? null : current));
    } catch (error) {
      Alert.alert('Fejl', getSongMutationErrorMessage(error, 'delete'));
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
        uploadProgress={uploadProgress}
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
