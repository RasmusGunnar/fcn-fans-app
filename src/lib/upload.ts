import { supabase } from './supabase';
import { MediaAsset } from './mediaPicker';

function getExtensionFromUri(uri: string, type: 'image' | 'video'): string {
  const q = uri.split('?')[0];
  const dot = q.lastIndexOf('.')
  if (dot !== -1) return q.substring(dot + 1).toLowerCase();
  return type === 'image' ? 'jpg' : 'mp4';
}

export async function uploadMediaToSupabase(userId: string, asset: MediaAsset): Promise<{ path: string; publicUrl: string; type: 'image' | 'video'; width?: number; height?: number; }> {
  // Auth guard: verify user is authenticated
  if (!userId || userId.trim() === '') {
    throw new Error('uploadMediaToSupabase: Not authenticated (userId missing)');
  }

  const ext = getExtensionFromUri(asset.uri, asset.type);
  const now = new Date();
  const yyyyMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fileName = `${cryptoRandom()}.${ext}`;
  const path = `${userId}/${yyyyMM}/${fileName}`;

  console.log('[Upload] Starting upload to post-media bucket', { path, type: asset.type });

  const resp = await fetch(asset.uri);
  const blob = await resp.blob();
  console.log('[Upload] Blob created', { size: blob.size, type: blob.type });

  const { data, error } = await supabase.storage.from('post-media').upload(path, blob, {
    contentType: asset.type === 'image' ? `image/${ext}` : `video/${ext}`,
    upsert: false,
  });
  if (error) {
    const errorMsg = `uploadMediaToSupabase failed: ${error.message} (details: ${(error as any)?.details ?? 'no details'})`;
    console.error('[Upload] Error', { error: errorMsg, path });
    throw new Error(errorMsg);
  }
  console.log('[Upload] Upload success', { path: data.path });

  const { data: pub } = supabase.storage.from('post-media').getPublicUrl(data.path);
  
  // Sanity check: publicUrl must be valid HTTP(S) URL
  if (!pub.publicUrl || !pub.publicUrl.startsWith('http')) {
    const errorMsg = `Upload succeeded but publicUrl is invalid or empty: ${pub.publicUrl}`;
    console.error('[Upload] Invalid publicUrl', { path: data.path, publicUrl: pub.publicUrl });
    throw new Error(errorMsg);
  }
  
  console.log('[Upload] Public URL generated', { url: pub.publicUrl });
  
  // Return both path and publicUrl for flexibility
  return {
    path: data.path,
    publicUrl: pub.publicUrl,
    type: asset.type,
    width: asset.width,
    height: asset.height,
  };
}

function cryptoRandom(): string {
  // Lightweight random string for path; in RN we can use Math.random()
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
