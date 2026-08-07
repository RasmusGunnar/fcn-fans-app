import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as tus from 'tus-js-client';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase, supabaseUrl } from '../lib/supabase';
import {
  buildSongAudioPath,
  isSongAudioStoragePath,
  type SongAudioMetadata,
  type SongAudioUploadCandidate,
  validateSongAudioFile,
} from '../utils/songAudio';

export const SONG_AUDIO_BUCKET = 'song-audio';
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const TUS_STALL_TIMEOUT_MS = 90_000;
const TUS_STORE_PREFIX = '@fcn-fans/song-audio-tus/';

type StoredUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
};

class AsyncStorageTusUrlStore {
  async findAllUploads(): Promise<StoredUpload[]> {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(TUS_STORE_PREFIX),
    );
    if (keys.length === 0) return [];

    const entries = await AsyncStorage.multiGet(keys);
    return entries.flatMap(([key, value]) => {
      if (!value) return [];
      try {
        return [{ ...(JSON.parse(value) as StoredUpload), urlStorageKey: key }];
      } catch {
        return [];
      }
    });
  }

  async findUploadsByFingerprint(fingerprint: string): Promise<StoredUpload[]> {
    const uploads = await this.findAllUploads();
    return uploads.filter((upload) => upload.metadata.songAudioFingerprint === fingerprint);
  }

  async removeUpload(urlStorageKey: string): Promise<void> {
    if (urlStorageKey.startsWith(TUS_STORE_PREFIX)) {
      await AsyncStorage.removeItem(urlStorageKey);
    }
  }

  async addUpload(fingerprint: string, upload: StoredUpload): Promise<string> {
    const key = `${TUS_STORE_PREFIX}${encodeURIComponent(fingerprint)}/${encodeURIComponent(
      upload.creationTime,
    )}`;
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        ...upload,
        metadata: { ...upload.metadata, songAudioFingerprint: fingerprint },
        urlStorageKey: key,
      }),
    );
    return key;
  }
}

export class SongAudioUploadError extends Error {
  constructor(message = 'song_audio_upload_failed') {
    super(message);
    this.name = 'SongAudioUploadError';
  }
}

function getResumableEndpoint(): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export async function pickSongAudioFile(songId: string): Promise<SongAudioUploadCandidate | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/x-m4a',
      'audio/m4a',
      'audio/aac',
      'audio/x-aac',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const size = asset.size ?? new File(asset.uri).size;
  const validated = validateSongAudioFile({
    uri: asset.uri,
    name: asset.name,
    size,
    mimeType: asset.mimeType,
  });
  const randomUuid = await Crypto.randomUUID();

  return {
    ...validated,
    storagePath: buildSongAudioPath(songId, randomUuid, validated.extension),
  };
}

export function getSongAudioPublicUrl(path?: string | null): string | null {
  if (!path || !isSongAudioStoragePath(path)) return null;
  return getPublicUrl(SONG_AUDIO_BUCKET, path);
}

export async function uploadSongAudio(
  file: SongAudioUploadCandidate,
  onProgress?: (progress: number) => void,
): Promise<SongAudioMetadata> {
  if (!isSongAudioStoragePath(file.storagePath)) {
    throw new SongAudioUploadError();
  }

  const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
  if (online === false) {
    throw new SongAudioUploadError('offline');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new SongAudioUploadError('permission_lost');
  }

  const fingerprint = `song-audio:${file.storagePath}:${file.size}`;
  const source = {
    uri: file.uri,
    type: file.mimeType,
    name: file.name,
  } as unknown as File;

  return new Promise((resolve, reject) => {
    let settled = false;
    let stallTimeout: ReturnType<typeof setTimeout> | null = null;
    let upload: tus.Upload;

    const clearStallTimeout = () => {
      if (stallTimeout) clearTimeout(stallTimeout);
      stallTimeout = null;
    };
    const rejectUpload = (uploadError: SongAudioUploadError) => {
      if (settled) return;
      settled = true;
      clearStallTimeout();
      reject(uploadError);
    };
    const armStallTimeout = () => {
      if (settled) return;
      clearStallTimeout();
      stallTimeout = setTimeout(() => {
        if (settled) return;
        void upload.abort().catch(() => undefined);
        rejectUpload(new SongAudioUploadError('timeout'));
      }, TUS_STALL_TIMEOUT_MS);
    };

    upload = new tus.Upload(source, {
      endpoint: getResumableEndpoint(),
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: SONG_AUDIO_BUCKET,
        objectName: file.storagePath,
        contentType: file.mimeType,
        cacheControl: '3600',
      },
      chunkSize: TUS_CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () => fingerprint,
      urlStorage: new AsyncStorageTusUrlStore(),
      onProgress: (bytesSent, bytesTotal) => {
        armStallTimeout();
        onProgress?.(bytesTotal > 0 ? bytesSent / bytesTotal : 0);
      },
      onError: () => rejectUpload(new SongAudioUploadError()),
      onSuccess: () => {
        if (settled) return;
        settled = true;
        clearStallTimeout();
        onProgress?.(1);
        resolve({ path: file.storagePath, mimeType: file.mimeType, sizeBytes: file.size });
      },
    });

    armStallTimeout();
    void upload
      .findPreviousUploads()
      .then((previousUploads) => {
        const previous = previousUploads.sort((a, b) =>
          a.creationTime.localeCompare(b.creationTime),
        )[previousUploads.length - 1];
        if (previous) upload.resumeFromPreviousUpload(previous);
        upload.start();
      })
      .catch(() => upload.start());
  });
}

export async function deleteSongAudio(path: string): Promise<void> {
  if (!isSongAudioStoragePath(path)) {
    throw new Error('Invalid song audio path');
  }

  const { error } = await supabase.storage.from(SONG_AUDIO_BUCKET).remove([path]);
  if (error) throw error;
}
