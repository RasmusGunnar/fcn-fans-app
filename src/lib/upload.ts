import { supabase } from './supabase';
import { PickedMedia } from './mediaPicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

/**
 * Convert base64 string to Uint8Array for reliable Supabase uploads in Expo
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getExtensionFromUri(uri: string, type: 'image' | 'video'): string {
  const q = uri.split('?')[0];
  const dot = q.lastIndexOf('.');
  if (dot !== -1) return q.substring(dot + 1).toLowerCase();
  return type === 'image' ? 'jpg' : 'mp4';
}

export async function uploadMediaToSupabase(
  userId: string,
  asset: PickedMedia,
): Promise<{
  path: string;
  publicUrl: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
}> {
  // Auth guard: verify user is authenticated
  if (!userId || userId.trim() === '') {
    throw new Error('uploadMediaToSupabase: Not authenticated (userId missing)');
  }

  // Force .jpg extension for images (they're all JPEG now)
  const ext = asset.type === 'image' ? 'jpg' : getExtensionFromUri(asset.uri, asset.type);
  const now = new Date();
  const yyyyMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fileName = `${await cryptoRandom()}.${ext}`;
  const path = `${userId}/${yyyyMM}/${fileName}`;

  const uploadMimeType = asset.mimeType || (asset.type === 'image' ? 'image/jpeg' : `video/${ext}`);

  console.log('[Upload] Starting upload to post-media bucket', {
    path,
    type: asset.type,
    originalMimeType: asset.mimeType,
    uploadMimeType,
  });

  if (!asset.uri) {
    throw new Error('uploadMediaToSupabase: Missing asset URI');
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to Uint8Array (reliable for Supabase in Expo)
  const bytes = base64ToUint8Array(base64);
  console.log('[Upload] Converted to byte array:', { length: bytes.length });

  // Verify bytes has content
  if (bytes.length === 0) {
    throw new Error('Media byte array is empty (0 bytes). Cannot upload empty file.');
  }

  const { data, error } = await supabase.storage.from('post-media').upload(path, bytes, {
    contentType: uploadMimeType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) {
    const errorMsg = `uploadMediaToSupabase failed: ${error.message} (details: ${(error as any)?.details ?? 'no details'})`;
    console.error('[Upload] Error', { error: errorMsg, path });
    throw new Error(errorMsg);
  }
  console.log('[Upload] Upload success', { path: data.path });

  // Verify upload - check that stored size > 0
  try {
    const pathParts = path.split('/');
    const fileNameOnly = pathParts[pathParts.length - 1];
    const folderPath = pathParts.slice(0, -1).join('/');
    const { data: listData, error: listError } = await supabase.storage
      .from('post-media')
      .list(folderPath, { search: fileNameOnly });
    if (listError) {
      console.warn('[Upload] List verification error:', listError);
    } else {
      const fileMetadata = listData?.[0];
      const storedSize = fileMetadata?.metadata?.size || 0;
      console.log('[Upload] Uploaded file metadata:', {
        name: fileMetadata?.name,
        size: storedSize,
        contentType: fileMetadata?.metadata?.mimetype,
        expectedLength: bytes.length,
      });
      if (storedSize === 0) {
        throw new Error('Upload failed: Stored file is 0 bytes. This is a Supabase Storage issue.');
      }
    }
  } catch (verifyError) {
    console.error('[Upload] Verification failed:', verifyError);
    throw verifyError; // Re-throw to fail the upload
  }

  // Return bucket and path (NOT the publicUrl)
  // The app will generate URLs on-demand using getPublicUrl helper
  return {
    path: data.path,
    publicUrl: '', // Keep for backwards compatibility but don't use
    type: asset.type,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  };
}

async function cryptoRandom(): Promise<string> {
  // Use expo-crypto for secure random UUID generation
  return Crypto.randomUUID();
}
