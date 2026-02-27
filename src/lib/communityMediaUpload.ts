import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';

export async function pickAndUploadCommunityImage(
  communityId: string,
  type: 'cover' | 'avatar',
): Promise<string | null> {
  // Pick image
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Fejl', 'Tilladelse til billedbibliotek kræves');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: type === 'cover' ? [16, 9] : [1, 1],
    quality: 0.9,
    base64: false,
  });
  if (result.canceled) return null;
  const uri = result.assets[0].uri;
  // Validate file
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists || fileInfo.size === 0) {
    Alert.alert('Fejl', 'Filen kunne ikke findes eller er tom');
    return null;
  }
  // Manipulate image
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: type === 'cover' ? 1200 : 512 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const base64 = manipResult.base64;
  if (!base64) {
    Alert.alert('Fejl', 'Kunne ikke konvertere billedet');
    return null;
  }
  // Upload
  const fileName = `${Date.now()}-${communityId}-${type}.jpg`;
  const path = `communities/${communityId}/${type}/${fileName}`;
  const bytes = base64ToUint8Array(base64);
  const { error } = await supabase.storage
    .from('community-media')
    .upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    });
  if (error) {
    Alert.alert('Fejl', 'Upload fejlede. Prøv igen.');
    return null;
  }
  return path;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
