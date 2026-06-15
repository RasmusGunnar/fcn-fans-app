import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { logger } from './logger';
import type { PickedMedia } from './mediaPicker';
import { supabase } from './supabase';

const POST_MEDIA_BUCKET = 'post-media';

export type UploadedMedia = {
  bucket: string;
  path: string;
  publicUrl: string;
  type: 'image' | 'video';
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail_path?: string;
  thumbnail_bucket?: string;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getExtension(asset: PickedMedia): string {
  if (asset.type === 'image') {
    return 'jpg';
  }

  const mimeSubtype = asset.mimeType?.split('/')[1]?.split(';')[0]?.toLowerCase();
  if (mimeSubtype === 'quicktime') {
    return 'mov';
  }
  if (mimeSubtype && /^[a-z0-9]+$/.test(mimeSubtype)) {
    return mimeSubtype;
  }

  const cleanUri = asset.uri.split(/[?#]/)[0];
  const extension = cleanUri.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension || 'mp4';
}

function getUploadMimeType(asset: PickedMedia, extension: string): string {
  if (asset.type === 'image') {
    return 'image/jpeg';
  }
  return asset.mimeType || (extension === 'mov' ? 'video/quicktime' : `video/${extension}`);
}

async function uploadBytes(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new Error('Media byte array is empty (0 bytes). Cannot upload empty file.');
  }

  const { data, error } = await supabase.storage.from(POST_MEDIA_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) {
    throw new Error(
      `uploadMediaToSupabase failed: ${error.message} (details: ${(error as any)?.details ?? 'no details'})`,
    );
  }

  return data.path;
}

async function createAndUploadVideoThumbnail(
  userId: string,
  yearMonth: string,
  fileName: string,
  videoUri: string,
): Promise<{ thumbnailPath?: string; thumbnailBucket?: string }> {
  try {
    const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 1000,
    });
    const thumbnail = await ImageManipulator.manipulateAsync(thumbnailUri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    if (!thumbnail.base64) {
      logger.warn('[Upload] Thumbnail conversion returned no data');
      return {};
    }

    const thumbnailFileName = fileName.replace(/\.[^.]+$/, '.thumb.jpg');
    const thumbnailPath = `${userId}/${yearMonth}/${thumbnailFileName}`;
    const uploadedThumbnailPath = await uploadBytes(
      thumbnailPath,
      base64ToUint8Array(thumbnail.base64),
      'image/jpeg',
    );

    return {
      thumbnailPath: uploadedThumbnailPath,
      thumbnailBucket: POST_MEDIA_BUCKET,
    };
  } catch (error) {
    logger.warn('[Upload] Thumbnail generation/upload failed; continuing without it', error);
    return {};
  }
}

export async function uploadMediaToSupabase(
  userId: string,
  asset: PickedMedia,
): Promise<UploadedMedia> {
  if (!userId.trim()) {
    throw new Error('uploadMediaToSupabase: Not authenticated (userId missing)');
  }
  if (!asset.uri) {
    throw new Error('uploadMediaToSupabase: Missing asset URI');
  }

  const extension = getExtension(asset);
  const uploadMimeType = getUploadMimeType(asset, extension);
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fileName = `${await Crypto.randomUUID()}.${extension}`;
  const path = `${userId}/${yearMonth}/${fileName}`;

  logger.log('[Upload] Starting media upload', {
    type: asset.type,
    path,
    mimeType: uploadMimeType,
  });

  let bytes: Uint8Array;
  if (asset.type === 'image') {
    if (!asset.base64) {
      throw new Error('No base64 data for image. Check mediaPicker configuration.');
    }
    bytes = base64ToUint8Array(asset.base64);
  } else {
    // Video uploads use the raw local file bytes. They are never converted to base64.
    bytes = await new File(asset.uri).bytes();
  }

  const uploadedPath = await uploadBytes(path, bytes, uploadMimeType);
  const thumbnail =
    asset.type === 'video'
      ? await createAndUploadVideoThumbnail(userId, yearMonth, fileName, asset.uri)
      : {};

  const result: UploadedMedia = {
    bucket: POST_MEDIA_BUCKET,
    path: uploadedPath,
    publicUrl: '',
    type: asset.type,
    mimeType: uploadMimeType,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    duration: asset.duration ?? undefined,
    thumbnail_path: thumbnail.thumbnailPath,
    thumbnail_bucket: thumbnail.thumbnailBucket,
  };

  logger.log('[Upload] Media upload complete', {
    type: result.type,
    bucket: result.bucket,
    path: result.path,
    thumbnailPath: result.thumbnail_path ?? null,
  });

  return result;
}
