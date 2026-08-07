import * as Crypto from 'expo-crypto';
import type { PickedMedia } from './mediaPicker';
import { logger } from './logger';
import { supabase } from './supabase';
import type { MessageMediaUpload } from '../types/messages';

export const MESSAGE_MEDIA_BUCKET = 'message-media';
export const MESSAGE_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function uploadMessageImage(
  conversationId: string,
  senderId: string,
  asset: PickedMedia,
): Promise<MessageMediaUpload> {
  if (asset.type !== 'image' || !asset.base64 || !asset.width || !asset.height) {
    throw new Error('Billedet kunne ikke læses.');
  }

  const bytes = base64ToUint8Array(asset.base64);
  if (bytes.byteLength <= 0 || bytes.byteLength > MESSAGE_MEDIA_MAX_BYTES) {
    throw new Error('Billedet må højst fylde 10 MB.');
  }

  const path = `${conversationId}/${senderId}/${Crypto.randomUUID()}.jpg`;
  const { data, error } = await supabase.storage.from(MESSAGE_MEDIA_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || 'Billedet kunne ikke uploades.');
  }

  return {
    path: data.path,
    mimeType: 'image/jpeg',
    width: asset.width,
    height: asset.height,
    sizeBytes: bytes.byteLength,
  };
}

export async function removeMessageImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MESSAGE_MEDIA_BUCKET).remove([path]);
  if (error) {
    logger.warn('[messageMedia] Orphan cleanup failed', { path, message: error.message });
  }
}

export async function signMessageImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (error) {
    logger.warn('[messageMedia] Signed URL failed', { path, message: error.message });
    return null;
  }
  return data.signedUrl;
}
