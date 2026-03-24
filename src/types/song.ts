export type SongCategory = 'slagsang' | 'spillersang';

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  spotifyUrl: string | null;
  melodyReference?: string | null;
  category: SongCategory;
  sortOrder: number;
  source?: string | null;
  sourceUrl?: string | null;
  sourceKey?: string | null;
  sourceHash?: string | null;
  importedAt?: string | null;
  lastSyncedAt?: string | null;
  isManuallyEdited?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const SONG_CATEGORY_LABELS: Record<SongCategory, string> = {
  slagsang: 'Slagsange',
  spillersang: 'Spillersange',
};

export function normalizeSongCategory(value: unknown): SongCategory {
  return value === 'spillersang' ? 'spillersang' : 'slagsang';
}
