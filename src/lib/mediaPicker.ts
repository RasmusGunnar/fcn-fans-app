import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert, Platform } from 'react-native';

export type MediaType = 'image' | 'video';

export type PickedMedia = {
  uri: string;
  type: MediaType;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileName?: string | null;
};

export type MediaAsset = PickedMedia;

export async function ensurePermissions(): Promise<boolean> {
  const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (libStatus !== 'granted') {
    Alert.alert('Tilladelse mangler', 'Giv adgang til mediebibliotek for at fortsætte.');
    return false;
  }
  return true;
}

export async function ensureCameraPermissions(): Promise<boolean> {
  const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
  if (camStatus !== 'granted') {
    Alert.alert('Tilladelse mangler', 'Giv adgang til kameraet for at fortsætte.');
    return false;
  }
  return true;
}

export async function pickFromLibrary(): Promise<PickedMedia | null> {
  const hasPermission = await ensurePermissions();
  if (!hasPermission) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.8,
    allowsEditing: false,
    videoMaxDuration: 60,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) {
    Alert.alert('Fejl', 'Kunne ikke læse filen. Prøv igen.');
    return null;
  }

  let detectedType: MediaType = asset.type === 'video' ? 'video' : 'image';
  if (asset.type !== 'video' && asset.uri) {
    const lowerUri = asset.uri.toLowerCase();
    if (
      lowerUri.includes('.mp4') ||
      lowerUri.includes('.mov') ||
      lowerUri.includes('.m4v') ||
      lowerUri.includes('video')
    ) {
      detectedType = 'video';
    }
  }

  if (detectedType === 'video' && asset.duration && asset.duration > 60) {
    Alert.alert('Videoen er for lang', 'Maksimal varighed er 60 sekunder.');
    return null;
  }

  if (detectedType === 'image') {
    const originalMimeType = asset.mimeType || 'unknown';
    const isHeic =
      originalMimeType.toLowerCase().includes('heic') ||
      originalMimeType.toLowerCase().includes('heif') ||
      asset.uri.toLowerCase().includes('.heic') ||
      asset.uri.toLowerCase().includes('.heif');

    console.log('[pickFromLibrary] Converting image to JPEG', {
      originalUri: asset.uri,
      originalMimeType,
      isHeic,
      platform: Platform.OS,
    });

    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: false },
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
      mimeType: 'image/jpeg',
      fileName: asset.fileName ?? null,
    };
  }

  return {
    uri: asset.uri,
    type: 'video',
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
  };
}

export async function pickImageFromLibrary(): Promise<PickedMedia | null> {
  const hasPermission = await ensurePermissions();
  if (!hasPermission) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsEditing: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) {
    Alert.alert('Fejl', 'Kunne ikke læse billedfilen. Prøv igen.');
    return null;
  }

  const originalMimeType = asset.mimeType || 'unknown';
  const isHeic =
    originalMimeType.toLowerCase().includes('heic') ||
    originalMimeType.toLowerCase().includes('heif') ||
    asset.uri.toLowerCase().includes('.heic') ||
    asset.uri.toLowerCase().includes('.heif');

  console.log('[pickImageFromLibrary] Converting image to JPEG', {
    originalUri: asset.uri,
    originalMimeType,
    isHeic,
    platform: Platform.OS,
  });

  const manipResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    [],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: false },
  );

  return {
    uri: manipResult.uri,
    type: 'image',
    width: manipResult.width,
    height: manipResult.height,
    mimeType: 'image/jpeg',
    fileName: asset.fileName ?? null,
  };
}

export async function pickCameraPhoto(): Promise<PickedMedia | null> {
  const hasPermission = await ensureCameraPermissions();
  if (!hasPermission) return null;

  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) {
    Alert.alert('Fejl', 'Kunne ikke læse billedfilen. Prøv igen.');
    return null;
  }

  // Convert to JPEG to avoid HEIC/format issues
  const originalMimeType = asset.mimeType || 'unknown';
  console.log('[pickCameraPhoto] Converting camera image to JPEG', {
    originalUri: asset.uri,
    originalMimeType,
  });

  const manipResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    [], // No transformations, just format conversion
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: false },
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
    mimeType: 'image/jpeg',
    fileName: asset.fileName ?? null,
  };
}

export async function recordVideo(): Promise<PickedMedia | null> {
  const hasPermission = await ensureCameraPermissions();
  if (!hasPermission) return null;

  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 1,
    videoMaxDuration: 60,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) {
    Alert.alert('Fejl', 'Kunne ikke læse videofilen. Prøv igen.');
    return null;
  }
  if (asset.duration && asset.duration > 60) {
    Alert.alert('Videoen er for lang', 'Maksimal varighed er 60 sekunder.');
    return null;
  }
  return {
    uri: asset.uri,
    type: 'video',
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
  };
}

export async function pickCameraVideo(): Promise<PickedMedia | null> {
  return recordVideo();
}
