export const SONG_AUDIO_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export type SongAudioExtension = 'mp3' | 'm4a' | 'aac';
export type SongAudioMimeType = 'audio/mpeg' | 'audio/mp4' | 'audio/aac';

export type SongAudioFileInput = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string | null;
};

export type ValidatedSongAudioFile = SongAudioFileInput & {
  extension: SongAudioExtension;
  mimeType: SongAudioMimeType;
};

export type SongAudioUploadCandidate = ValidatedSongAudioFile & {
  storagePath: string;
};

export type SongAudioMetadata = {
  path: string;
  mimeType: SongAudioMimeType;
  sizeBytes: number;
};

export type SongAudioChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; file: SongAudioUploadCandidate };

export type SongAudioValidationCode = 'invalid_format' | 'empty_file' | 'too_large';

export class SongAudioValidationError extends Error {
  constructor(public readonly code: SongAudioValidationCode) {
    super(code);
    this.name = 'SongAudioValidationError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXTENSION: Record<SongAudioExtension, SongAudioMimeType> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

const NORMALIZED_MIME_TYPES: Record<string, SongAudioMimeType> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/x-aac': 'audio/aac',
};

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'application/unknown']);

function getExtension(fileName: string): SongAudioExtension | null {
  const extension = fileName.trim().split('.').pop()?.toLowerCase();
  return extension === 'mp3' || extension === 'm4a' || extension === 'aac' ? extension : null;
}

export function validateSongAudioFile(input: SongAudioFileInput): ValidatedSongAudioFile {
  const extension = getExtension(input.name);
  if (!extension) {
    throw new SongAudioValidationError('invalid_format');
  }

  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new SongAudioValidationError('empty_file');
  }
  if (input.size > SONG_AUDIO_MAX_SIZE_BYTES) {
    throw new SongAudioValidationError('too_large');
  }

  const reportedMime = input.mimeType?.trim().toLowerCase() ?? '';
  const normalizedMime = NORMALIZED_MIME_TYPES[reportedMime];
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!normalizedMime && !GENERIC_MIME_TYPES.has(reportedMime)) {
    throw new SongAudioValidationError('invalid_format');
  }
  if (normalizedMime && normalizedMime !== expectedMime) {
    throw new SongAudioValidationError('invalid_format');
  }

  return {
    ...input,
    extension,
    mimeType: expectedMime,
  };
}

export function buildSongAudioPath(
  songId: string,
  randomUuid: string,
  extension: SongAudioExtension,
): string {
  if (!UUID_PATTERN.test(songId) || !UUID_PATTERN.test(randomUuid)) {
    throw new Error('Invalid song audio UUID');
  }
  return `${songId.toLowerCase()}/${randomUuid.toLowerCase()}.${extension}`;
}

export function isSongAudioStoragePath(path: string): boolean {
  const [songId, fileName, extra] = path.split('/');
  if (extra || !songId || !fileName || !UUID_PATTERN.test(songId)) return false;

  const match = fileName.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.](mp3|m4a|aac)$/i,
  );
  return !!match && UUID_PATTERN.test(match[1]);
}

export function formatSongAudioSize(sizeBytes?: number | null): string | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatSongAudioTime(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

export function getSongAudioDisplayPosition(
  currentTime: number,
  duration: number,
  didJustFinish: boolean,
): number {
  if (didJustFinish) return 0;
  if (!Number.isFinite(currentTime) || currentTime < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return currentTime;
  return Math.min(currentTime, duration);
}

type SaveSagaOptions<Result> = {
  change: SongAudioChange;
  currentAudioPath?: string | null;
  upload: (file: SongAudioUploadCandidate) => Promise<SongAudioMetadata>;
  update: (audio: SongAudioMetadata | null | undefined) => Promise<Result>;
  deleteAudio: (path: string) => Promise<void>;
  onCleanupError?: (error: unknown) => void;
};

async function cleanupAudio(
  path: string | null | undefined,
  deleteAudio: (path: string) => Promise<void>,
  onCleanupError?: (error: unknown) => void,
): Promise<void> {
  if (!path) return;
  try {
    await deleteAudio(path);
  } catch (error) {
    onCleanupError?.(error);
  }
}

export async function runSongAudioSaveSaga<Result>({
  change,
  currentAudioPath,
  upload,
  update,
  deleteAudio,
  onCleanupError,
}: SaveSagaOptions<Result>): Promise<Result> {
  if (change.kind === 'keep') {
    return update(undefined);
  }

  if (change.kind === 'remove') {
    const result = await update(null);
    await cleanupAudio(currentAudioPath, deleteAudio, onCleanupError);
    return result;
  }

  const uploadedAudio = await upload(change.file);
  let result: Result;
  try {
    result = await update(uploadedAudio);
  } catch (error) {
    await cleanupAudio(uploadedAudio.path, deleteAudio, onCleanupError);
    throw error;
  }

  if (currentAudioPath && currentAudioPath !== uploadedAudio.path) {
    await cleanupAudio(currentAudioPath, deleteAudio, onCleanupError);
  }
  return result;
}

type DeleteSagaOptions = {
  audioPath?: string | null;
  deleteSongRow: () => Promise<void>;
  deleteAudio: (path: string) => Promise<void>;
  onCleanupError?: (error: unknown) => void;
};

export async function runSongDeleteSaga({
  audioPath,
  deleteSongRow,
  deleteAudio,
  onCleanupError,
}: DeleteSagaOptions): Promise<void> {
  await deleteSongRow();
  await cleanupAudio(audioPath, deleteAudio, onCleanupError);
}
