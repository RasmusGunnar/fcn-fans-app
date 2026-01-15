import * as ImagePicker from 'expo-image-picker';

export type MediaType = 'image' | 'video';

export type MediaAsset = {
  uri: string;
  type: MediaType;
  width?: number;
  height?: number;
  duration?: number;
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
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.9,
    allowsEditing: false,
    videoMaxDuration: 60,
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
    if (lowerUri.includes('.mp4') || lowerUri.includes('.mov') || lowerUri.includes('.m4v') || lowerUri.includes('video')) {
      detectedType = 'video';
    }
  }
  
  return {
    uri: a.uri,
    type: detectedType,
    width: a.width,
    height: a.height,
    duration: (a as any).duration,
  };
}

export async function pickCameraPhoto(): Promise<MediaAsset | null> {
  await ensureCameraPermissions();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });
  if (res.canceled) return null;
  const a = res.assets?.[0];
  if (!a) return null;
  return {
    uri: a.uri,
    type: 'image',
    width: a.width,
    height: a.height,
  };
}

export async function pickCameraVideo(): Promise<MediaAsset | null> {
  await ensureCameraPermissions();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 0.9,
    videoMaxDuration: 60,
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
  };
}
