import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { PickedMedia } from './mediaPicker';
import { logger } from './logger';
import { supabase } from './supabase';
import { DISCUSSION_MAX_VIDEO_BYTES } from '../utils/discussion';

export const DISCUSSION_MEDIA_BUCKET = 'discussion-media';

export type UploadedDiscussionMedia = {
  bucket: string;
  path: string;
  type: 'image' | 'video';
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  sizeBytes: number;
  thumbnailPath?: string | null;
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
  if (mimeSubtype === 'quicktime') return 'mov';
  if (mimeSubtype && /^[a-z0-9]+$/.test(mimeSubtype)) return mimeSubtype;

  const extension = asset.uri
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  return extension || 'mp4';
}

function getMimeType(asset: PickedMedia, extension: string): string {
  if (asset.type === 'image') return 'image/jpeg';
  return asset.mimeType || (extension === 'mov' ? 'video/quicktime' : `video/${extension}`);
}

async function uploadBytes(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (bytes.byteLength <= 0) {
    throw new Error('Mediefilen er tom.');
  }

  const { data, error } = await supabase.storage.from(DISCUSSION_MEDIA_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || 'Upload fejlede.');
  }

  return data.path;
}

async function createVideoThumbnail(
  userId: string,
  postId: string,
  fileName: string,
  videoUri: string,
): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
    const thumbnail = await ImageManipulator.manipulateAsync(uri, [], {
      base64: true,
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    if (!thumbnail.base64) {
      return null;
    }

    const path = `${userId}/${postId}/${fileName.replace(/\.[^.]+$/, '.thumb.jpg')}`;
    return uploadBytes(path, base64ToUint8Array(thumbnail.base64), 'image/jpeg');
  } catch (error) {
    logger.warn('[discussionMedia] Video thumbnail failed; continuing without thumbnail', error);
    return null;
  }
}

export async function uploadDiscussionMedia(
  userId: string,
  postId: string,
  asset: PickedMedia,
): Promise<UploadedDiscussionMedia> {
  if (!userId || !postId) {
    throw new Error('Du skal være logget ind for at uploade medier.');
  }

  const extension = getExtension(asset);
  const mimeType = getMimeType(asset, extension);
  const fileName = `${await Crypto.randomUUID()}.${extension}`;
  const path = `${userId}/${postId}/${fileName}`;

  let bytes: Uint8Array;
  if (asset.type === 'image') {
    if (!asset.base64) {
      throw new Error('Billedet kunne ikke læses.');
    }
    bytes = base64ToUint8Array(asset.base64);
  } else {
    bytes = await new File(asset.uri).bytes();
    if (bytes.byteLength > DISCUSSION_MAX_VIDEO_BYTES) {
      throw new Error('Videoen må højest fylde 50 MB.');
    }
  }

  const uploadedPath = await uploadBytes(path, bytes, mimeType);
  const thumbnailPath =
    asset.type === 'video' ? await createVideoThumbnail(userId, postId, fileName, asset.uri) : null;

  return {
    bucket: DISCUSSION_MEDIA_BUCKET,
    path: uploadedPath,
    type: asset.type,
    mimeType,
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationMs: asset.duration ?? null,
    sizeBytes: bytes.byteLength,
    thumbnailPath,
  };
}
