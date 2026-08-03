import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { normalizeSongCategory, type Song, type SongCategory } from '../types/song';

type SongRow = {
  id: string;
  title: string | null;
  lyrics: string | null;
  spotify_url: string | null;
  melody_reference?: string | null;
  category: string | null;
  sort_order: number | null;
  source?: string | null;
  source_url?: string | null;
  source_key?: string | null;
  source_hash?: string | null;
  imported_at?: string | null;
  last_synced_at?: string | null;
  is_manually_edited?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SONG_COLUMNS =
  'id, title, lyrics, spotify_url, melody_reference, category, sort_order, source, source_url, source_key, source_hash, imported_at, last_synced_at, is_manually_edited, created_at, updated_at';

const FALLBACK_SONGS: Song[] = [
  {
    id: 'fallback-1',
    title: 'Vi Er FCN',
    lyrics: `Vi er FCN, vi er FCN
Rod og hvid er vores farver
Vi er FCN, vi er FCN
Vi vinder hver kamp`,
    spotifyUrl: 'https://open.spotify.com/',
    category: 'slagsang',
    sortOrder: 10,
  },
  {
    id: 'fallback-2',
    title: 'Nordsjaelland Sang',
    lyrics: `Nordsjaelland, Nordsjaelland
Vi stotter vores hold
Nordsjaelland, Nordsjaelland
Vi er stolte af vores klub`,
    spotifyUrl: 'https://open.spotify.com/',
    category: 'slagsang',
    sortOrder: 20,
  },
  {
    id: 'fallback-3',
    title: 'Heia FCN',
    lyrics: `Heia FCN, heia FCN
Vi synger hojt og klart
Heia FCN, heia FCN
Vi er de bedste i landet`,
    spotifyUrl: 'https://open.spotify.com/',
    category: 'slagsang',
    sortOrder: 30,
  },
  {
    id: 'fallback-4',
    title: 'Rod og Hvid',
    lyrics: `Rod og hvid, rod og hvid
Det er vores farver
Rod og hvid, rod og hvid
Vi holder sammen`,
    spotifyUrl: 'https://open.spotify.com/',
    category: 'slagsang',
    sortOrder: 40,
  },
  {
    id: 'fallback-5',
    title: 'Vi Giver Aldrig Op',
    lyrics: `Vi giver aldrig op, aldrig op
Vi kamper til det sidste
Vi giver aldrig op, aldrig op
FCN sejrer altid`,
    spotifyUrl: 'https://open.spotify.com/',
    category: 'slagsang',
    sortOrder: 50,
  },
];

function mapSongRow(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title?.trim() || 'Ukendt sang',
    lyrics: row.lyrics ?? '',
    spotifyUrl: row.spotify_url ?? null,
    melodyReference: row.melody_reference ?? null,
    category: normalizeSongCategory(row.category),
    sortOrder: row.sort_order ?? 0,
    source: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    sourceKey: row.source_key ?? null,
    sourceHash: row.source_hash ?? null,
    importedAt: row.imported_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    isManuallyEdited: row.is_manually_edited ?? false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function sortSongs(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, 'da');
  });
}

export async function fetchSongs(): Promise<{ songs: Song[]; source: 'remote' | 'fallback' }> {
  const { data, error } = await supabase
    .from('songs')
    .select(SONG_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    logger.warn('[songsApi] Falling back to local songs:', error);
    return { songs: sortSongs(FALLBACK_SONGS), source: 'fallback' };
  }

  return {
    songs: sortSongs(((data as SongRow[] | null) ?? []).map(mapSongRow)),
    source: 'remote',
  };
}

export async function canManageWildTigersSongs(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('can_manage_wild_tigers_songs');

  if (error) {
    logger.warn('[songsApi] can_manage_wild_tigers_songs lookup failed:', error);
    return null;
  }

  return data === true;
}

export async function updateSong(
  songId: string,
  updates: { title: string; lyrics: string; category: SongCategory; spotifyUrl: string | null },
): Promise<Song> {
  const payload = {
    title: updates.title.trim(),
    lyrics: updates.lyrics.trim(),
    category: updates.category,
    spotify_url: updates.spotifyUrl?.trim() ? updates.spotifyUrl.trim() : null,
    is_manually_edited: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('songs')
    .update(payload)
    .eq('id', songId)
    .select(SONG_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return mapSongRow(data as SongRow);
}

export async function deleteSong(songId: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', songId);

  if (error) {
    throw error;
  }
}
