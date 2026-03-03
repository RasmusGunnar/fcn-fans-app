/**
 * Upload an event cover image to Supabase Storage (event-media bucket).
 *
 * Re-uses the proven pattern from uploadAvatar.ts:
 *   ImagePicker → ImageManipulator (JPEG) → base64 → Uint8Array → upload
 *
 * @returns { bucket, path } on success, null on cancel/error.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'event-media';
const MAX_WIDTH = 1200; // px — good balance between quality and size

// ─── helpers ─────────────────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface UploadCoverResult {
  bucket: string;
  path: string;
}

type PickerSource = 'gallery' | 'camera';

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Pick an image (gallery or camera), convert to JPEG, upload to event-media.
 *
 * @param eventId  – used as folder prefix in bucket
 * @param source   – 'gallery' | 'camera'
 */
export async function pickAndUploadEventCover(
  eventId: string,
  source: PickerSource = 'gallery',
): Promise<UploadCoverResult | null> {
  try {
    // 1. Request permission
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Tilladelse nødvendig', 'Vi skal bruge kameraet for at tage et billede.');
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Tilladelse nødvendig', 'Vi skal bruge adgang til dit fotobibliotek.');
        return null;
      }
    }

    // 2. Launch picker
    const pickerFn =
      source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

    const result = await pickerFn({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
      base64: false,
    });

    if (result.canceled) return null;

    const asset = result.assets[0];

    // 3. Validate file exists
    const fileInfo = await FileSystem.getInfoAsync(asset.uri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      Alert.alert('Fejl', 'Billedfilen kunne ikke læses.');
      return null;
    }

    // 4. Convert to JPEG via ImageManipulator
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    const base64 = manipResult.base64;
    if (!base64) {
      Alert.alert('Fejl', 'Kunne ikke konvertere billedet.');
      return null;
    }

    const bytes = base64ToUint8Array(base64);
    if (bytes.length === 0) {
      Alert.alert('Fejl', 'Konverteret billede er tomt (0 bytes).');
      return null;
    }

    // 5. Upload  –  path: events/<eventId>/cover.jpg
    const storagePath = `events/${eventId}/cover.jpg`;

    if (__DEV__) {
      logger.log('[uploadEventCover]', {
        eventId,
        source,
        bytes: bytes.length,
        path: storagePath,
        platform: Platform.OS,
      });
    }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '3600',
    });

    if (uploadError) {
      logger.error('[uploadEventCover] Upload error:', uploadError);
      Alert.alert('Upload fejlede', uploadError.message || 'Ukendt fejl');
      return null;
    }

    if (__DEV__) {
      logger.log('[uploadEventCover] Success:', storagePath);
    }

    return { bucket: BUCKET, path: storagePath };
  } catch (err: any) {
    logger.error('[uploadEventCover] Unexpected error:', err);
    Alert.alert('Fejl', err?.message || 'Kunne ikke uploade billede.');
    return null;
  }
}

/**
 * Delete an event cover from storage.
 */
export async function deleteEventCover(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      logger.error('[deleteEventCover] Error:', error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[deleteEventCover] Unexpected error:', err);
    return false;
  }
}
