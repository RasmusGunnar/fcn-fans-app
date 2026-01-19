import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

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
      console.warn('[uploadAvatar] Permission denied');
      return null;
    }

    // Launch image picker with base64 for reliable Expo uploads
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true, // Request base64 for reliable upload
    });

    if (result.canceled) {
      return null;
    }

    const imageUri = result.assets[0].uri;
    const base64 = result.assets[0].base64;
    console.log('[uploadAvatar] Image selected:', imageUri);

    if (!base64) {
      throw new Error('Failed to get base64 data from image picker');
    }

    // Convert base64 to Uint8Array (reliable for Supabase in Expo)
    const bytes = base64ToUint8Array(base64);
    console.log('[uploadAvatar] Converted to byte array:', { length: bytes.length });

    // Verify bytes has content
    if (bytes.length === 0) {
      throw new Error('Image byte array is empty (0 bytes). Cannot upload empty file.');
    }

    // Create file path (just userId.jpg in root of avatars bucket)
    const filePath = `${userId}.jpg`;

    // Upload to Supabase Storage using byte array
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.warn('[uploadAvatar] Upload error:', uploadError);
      return null;
    }

    console.log('[uploadAvatar] Upload successful:', uploadData);

    // Verify upload - check that stored size > 0
    try {
      const { data: listData, error: listError } = await supabase.storage
        .from('avatars')
        .list('', { search: filePath });
      if (listError) {
        console.warn('[uploadAvatar] List verification error:', listError);
      } else {
        const fileMetadata = listData?.[0];
        const storedSize = fileMetadata?.metadata?.size || 0;
        console.log('[uploadAvatar] Uploaded file metadata:', {
          name: fileMetadata?.name,
          size: storedSize,
          contentType: fileMetadata?.metadata?.mimetype,
          expectedLength: bytes.length
        });
        if (storedSize === 0) {
          throw new Error('Upload failed: Stored file is 0 bytes. This is a Supabase Storage issue.');
        }
      }
    } catch (verifyError) {
      console.error('[uploadAvatar] Verification failed:', verifyError);
      throw verifyError; // Re-throw to fail the upload
    }

    // Store ONLY the path in the database (not the full URL)
    const storagePath = `avatars/${filePath}`;
    console.log('[uploadAvatar] Storage path:', storagePath);

    // Update profile with avatar path (not URL)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: storagePath })
      .eq('id', userId);

    if (updateError) {
      console.warn('[uploadAvatar] Profile update error:', updateError);
      return null;
    }

    // Return path with cache buster for immediate display update
    return `${storagePath}?t=${Date.now()}`;
  } catch (error) {
    console.warn('[uploadAvatar] Unexpected error:', error);
    return null;
  }
}
