import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { logger } from './logger';

export const MAX_VIDEO_SECONDS = 60;
const MAX_IMAGE_WIDTH = 1600;
const IMAGE_COMPRESSION = 0.85;
const MS_PER_SECOND = 1000;

export type MediaType = 'image' | 'video';

export type PickedMedia = {
  uri: string;
  type: MediaType;
  base64?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileName?: string | null;
};

export type MediaAsset = PickedMedia;

export async function ensurePermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Tilladelse mangler', 'Giv adgang til mediebibliotek for at fortsætte.');
    return false;
  }
  return true;
}

export async function ensureCameraPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Tilladelse mangler', 'Giv adgang til kameraet for at fortsætte.');
    return false;
  }
  return true;
}

function detectMediaType(asset: ImagePicker.ImagePickerAsset): MediaType {
  if (asset.type === 'video') {
    return 'video';
  }

  const checkableValue =
    `${asset.mimeType ?? ''} ${asset.fileName ?? ''} ${asset.uri}`.toLowerCase();
  return /\.(mp4|mov|m4v|webm)(?:$|[?#\s])/.test(checkableValue) ||
    checkableValue.includes('video/')
    ? 'video'
    : 'image';
}

function isVideoWithinDurationLimit(duration?: number | null): boolean {
  if (!duration) {
    return true;
  }

  const durationSeconds = duration / MS_PER_SECOND;
  if (durationSeconds <= MAX_VIDEO_SECONDS) {
    return true;
  }

  Alert.alert(
    'Videoen er for lang',
    `Maksimal varighed er ${MAX_VIDEO_SECONDS} sekunder. Videoen er ${Math.round(durationSeconds)} sekunder.`,
  );
  return false;
}

async function convertImageToJpeg(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedMedia | null> {
  try {
    const actions: ImageManipulator.Action[] =
      asset.width && asset.width > MAX_IMAGE_WIDTH ? [{ resize: { width: MAX_IMAGE_WIDTH } }] : [];
    const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
      compress: IMAGE_COMPRESSION,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    if (!result.base64) {
      throw new Error('JPEG conversion returned no image data');
    }

    logger.log('[mediaPicker] Image converted to JPEG', {
      width: result.width,
      height: result.height,
      originalMimeType: asset.mimeType ?? null,
    });

    return {
      uri: result.uri,
      type: 'image',
      base64: result.base64,
      mimeType: 'image/jpeg',
      width: result.width,
      height: result.height,
      fileName: asset.fileName ?? null,
    };
  } catch (error) {
    logger.error('[mediaPicker] JPEG conversion failed:', error);
    Alert.alert('Fejl', 'Kunne ikke behandle billedet. Prøv igen.');
    return null;
  }
}

async function mapPickerAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedMedia | null> {
  const type = detectMediaType(asset);
  if (type === 'image') {
    return convertImageToJpeg(asset);
  }

  if (!isVideoWithinDurationLimit(asset.duration)) {
    return null;
  }

  return {
    uri: asset.uri,
    type: 'video',
    base64: null,
    mimeType: asset.mimeType ?? 'video/mp4',
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
    fileName: asset.fileName ?? null,
  };
}

export async function pickFromLibrary(): Promise<PickedMedia | null> {
  if (!(await ensurePermissions())) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
    allowsEditing: false,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return mapPickerAsset(result.assets[0]);
}

export async function pickImageFromLibrary(): Promise<PickedMedia | null> {
  if (!(await ensurePermissions())) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return convertImageToJpeg(result.assets[0]);
}

export async function pickCameraPhoto(): Promise<PickedMedia | null> {
  if (!(await ensureCameraPermissions())) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return convertImageToJpeg(result.assets[0]);
}

export async function recordVideo(): Promise<PickedMedia | null> {
  if (!(await ensureCameraPermissions())) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    quality: 1,
    allowsEditing: false,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return mapPickerAsset(result.assets[0]);
}

export async function pickCameraVideo(): Promise<PickedMedia | null> {
  return recordVideo();
}
