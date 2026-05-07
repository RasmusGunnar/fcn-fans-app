import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert } from 'react-native';
import { supabase } from './supabase';
import { logger } from './logger';

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

/**
 * Upload avatar image to Supabase Storage
 * @param userId - The user's ID
 * @returns Storage path with cache buster or null if error
 */
export async function uploadAvatar(userId: string): Promise<string | null> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      logger.warn('[uploadAvatar] Permission denied');
      return null;
    }

    // Launch image picker (without base64 initially - we'll get it after JPEG conversion)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], // Use new API format
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9, // High quality for avatars
      base64: false, // Get base64 after JPEG conversion
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];

    // Validate local file exists and has size > 0
    try {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (__DEV__) {
        logger.log('[AvatarUpload] Local file info:', fileInfo);
      }

      if (!fileInfo.exists) {
        Alert.alert('Fejl', 'Filen kunne ikke findes');
        return null;
      }

      if (fileInfo.size === 0) {
        Alert.alert('Fejl', 'Filen er tom (0 bytes)');
        return null;
      }
    } catch (fsError) {
      logger.warn('[AvatarUpload] FileSystem error:', fsError);
      Alert.alert('Fejl', 'Kunne ikke læse billedfil');
      return null;
    }

    const originalMimeType = asset.mimeType || 'unknown';
    const isHeic =
      originalMimeType.toLowerCase().includes('heic') ||
      originalMimeType.toLowerCase().includes('heif') ||
      asset.uri.toLowerCase().includes('.heic') ||
      asset.uri.toLowerCase().includes('.heif');

    logger.log('[uploadAvatar] Converting image to JPEG', {
      originalUri: asset.uri,
      originalMimeType,
      isHeic,
      platform: Platform.OS,
    });

    // Convert to JPEG to avoid HEIC/format issues (especially on iOS)
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 512 } }], // Resize to reasonable avatar size
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    logger.log('[uploadAvatar] JPEG conversion complete', {
      convertedUri: manipResult.uri,
      width: manipResult.width,
      height: manipResult.height,
    });

    const base64 = manipResult.base64;

    if (!base64) {
      throw new Error('Failed to get base64 data from image picker');
    }

    // Convert base64 to Uint8Array (reliable for Supabase in Expo)
    const bytes = base64ToUint8Array(base64);

    // Store each upload at a fresh path so public image URLs change immediately.
    const filePath = `${userId}/avatar-${Date.now()}.jpg`;

    if (__DEV__) {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      logger.log('[AvatarUpload]', {
        localSize: fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size : 'unknown',
        blobSize: bytes.length,
        path: filePath,
      });
    }

    // Verify bytes has content
    if (bytes.length === 0) {
      Alert.alert('Fejl', 'Billedet kunne ikke konverteres (0 bytes)');
      throw new Error('Image byte array is empty (0 bytes). Cannot upload empty file.');
    }

    // Upload to Supabase Storage using byte array
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      logger.warn('[uploadAvatar] Upload error:', uploadError);
      Alert.alert('Fejl', 'Upload fejlede: ' + (uploadError.message || 'Ukendt fejl'));
      return null;
    }

    logger.log('[uploadAvatar] Upload successful:', uploadData);

    // Verify upload - check that stored size > 0
    try {
      const { data: listData, error: listError } = await supabase.storage
        .from('avatars')
        .list('', { search: filePath });
      if (listError) {
        logger.warn('[uploadAvatar] List verification error:', listError);
      } else {
        const fileMetadata = listData?.[0];
        const storedSize = fileMetadata?.metadata?.size || 0;
        logger.log('[uploadAvatar] Uploaded file metadata:', {
          name: fileMetadata?.name,
          size: storedSize,
          contentType: fileMetadata?.metadata?.mimetype,
          expectedLength: bytes.length,
        });
        if (storedSize === 0) {
          throw new Error(
            'Upload failed: Stored file is 0 bytes. This is a Supabase Storage issue.',
          );
        }
      }
    } catch (verifyError) {
      logger.error('[uploadAvatar] Verification failed:', verifyError);
      throw verifyError; // Re-throw to fail the upload
    }

    // Save ONLY the path in profiles.avatar_url (not "avatars/"+path)
    // Path format: "userId/avatar-timestamp.jpg"
    if (__DEV__) {
      logger.log('[AvatarUpload] Saving path to DB:', filePath);
    }

    // Update profile with avatar path (not URL, not with bucket prefix)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: filePath })
      .eq('id', userId);

    if (updateError) {
      logger.warn('[uploadAvatar] Profile update error:', updateError);
      Alert.alert('Advarsel', 'Billede uploadet, men profil kunne ikke opdateres');
      return null;
    }

    // Success!
    if (__DEV__) {
      logger.log('[AvatarUpload] Success! Path:', filePath);
    }

    // Return the storage path; Avatar resolves it to a public URL for display.
    return filePath;
  } catch (error: any) {
    logger.warn('[uploadAvatar] Unexpected error:', error);
    Alert.alert('Fejl', error?.message || 'Kunne ikke uploade billede');
    return null;
  }
}
