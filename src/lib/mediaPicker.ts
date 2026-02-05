import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export type MediaType = 'image' | 'video';

export type MediaAsset = {
  uri: string;
  type: MediaType;
  width?: number;
  height?: number;
  duration?: number;
  base64?: string;
  mimeType?: string; // Add mimeType to track format
};

export async function ensurePermissions(): Promise<void> {
  const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (libStatus !== 'granted') throw new Error('Mediebibliotek tilladelse afvist');
}

export async function ensureCameraPermissions(): Promise<void> {
  const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
  if (camStatus !== 'granted') throw new Error('Kamera tilladelse afvist');
}

export async function pickFromLibrary(): Promise<MediaAsset | null> {
  await ensurePermissions();
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'], // Use new API (array format)
    quality: 0.9,
    allowsEditing: false,
    videoMaxDuration: 60,
    base64: false, // We'll get base64 after JPEG conversion for images
  });
  if (res.canceled) return null;
  const a = res.assets?.[0];
  if (!a) return null;

  // Sanity check: Robustly detect video type
  // Check explicit type first, then fallback to URI extension
  let detectedType: MediaType = 'image';
  if (a.type === 'video') {
    detectedType = 'video';
  } else if (a.uri) {
    const lowerUri = a.uri.toLowerCase();
    if (
      lowerUri.includes('.mp4') ||
      lowerUri.includes('.mov') ||
      lowerUri.includes('.m4v') ||
      lowerUri.includes('video')
    ) {
      detectedType = 'video';
    }
  }

  // For images: Convert to JPEG to avoid HEIC/format issues
  if (detectedType === 'image') {
    const originalMimeType = a.mimeType || 'unknown';
    const isHeic =
      originalMimeType.toLowerCase().includes('heic') ||
      originalMimeType.toLowerCase().includes('heif') ||
      a.uri.toLowerCase().includes('.heic') ||
      a.uri.toLowerCase().includes('.heif');

    console.log('[pickFromLibrary] Converting image to JPEG', {
      originalUri: a.uri,
      originalMimeType,
      isHeic,
      platform: Platform.OS,
    });

    const manipResult = await ImageManipulator.manipulateAsync(
      a.uri,
      [], // No transformations, just format conversion
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    console.log('[pickFromLibrary] JPEG conversion complete', {
      convertedUri: manipResult.uri,
      convertedMimeType: 'image/jpeg',
      width: manipResult.width,
      height: manipResult.height,
    });

    return {
      uri: manipResult.uri,
      type: 'image',
      width: manipResult.width,
      height: manipResult.height,
      base64: manipResult.base64,
      mimeType: 'image/jpeg',
    };
  }

  // For videos: No conversion, return as-is with base64
  // Re-fetch with base64 for videos
  const videoRes = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 0.9,
    allowsEditing: false,
    videoMaxDuration: 60,
    base64: true,
  });
  const videoAsset = videoRes.canceled ? null : videoRes.assets?.[0];

  return {
    uri: a.uri,
    type: detectedType,
    width: a.width,
    height: a.height,
    duration: (a as any).duration,
    base64: videoAsset?.base64 ?? a.base64 ?? undefined,
    mimeType: a.mimeType,
  };
}

export async function pickCameraPhoto(): Promise<MediaAsset | null> {
  await ensureCameraPermissions();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'], // Use new API (array format)
    quality: 0.9,
    base64: false, // We'll get base64 after JPEG conversion
  });
  if (res.canceled) return null;
  const a = res.assets?.[0];
  if (!a) return null;

  // Convert to JPEG to avoid HEIC/format issues
  const originalMimeType = a.mimeType || 'unknown';
  console.log('[pickCameraPhoto] Converting camera image to JPEG', {
    originalUri: a.uri,
    originalMimeType,
  });

  const manipResult = await ImageManipulator.manipulateAsync(
    a.uri,
    [], // No transformations, just format conversion
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  console.log('[pickCameraPhoto] JPEG conversion complete', {
    convertedUri: manipResult.uri,
    convertedMimeType: 'image/jpeg',
    width: manipResult.width,
    height: manipResult.height,
  });

  return {
    uri: manipResult.uri,
    type: 'image',
    width: manipResult.width,
    height: manipResult.height,
    base64: manipResult.base64,
    mimeType: 'image/jpeg',
  };
}

export async function pickCameraVideo(): Promise<MediaAsset | null> {
  await ensureCameraPermissions();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'], // Use new API (array format)
    quality: 0.9,
    videoMaxDuration: 60,
    base64: true, // Request base64 for reliable Supabase uploads
  });
  if (res.canceled) return null;
  const a = res.assets?.[0];
  if (!a) return null;
  return {
    uri: a.uri,
    type: 'video',
    width: a.width,
    height: a.height,
    duration: (a as any).duration,
    base64: a.base64 ?? undefined,
    mimeType: a.mimeType,
  };
}
