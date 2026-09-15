import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Same persisted contract as web: cover_url, post-media/<uid>/fan-activity-covers/<uuid>.jpg.
export const FAN_ACTIVITY_COVER_BUCKET = 'post-media';
const INPUT_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 700 * 1024;
export type FanActivityCoverSelection = { uri: string };

/** Local preview only. Nothing is uploaded until the activity is saved. */
export async function pickFanActivityCover(): Promise<FanActivityCoverSelection | undefined> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Tillad adgang til fotobiblioteket for at vælge et billede.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.9 });
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || !info.size || info.size > INPUT_MAX_BYTES) throw new Error('Vælg et billede på højst 10 MB.');
  const image = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: Math.min(asset.width, 1200) } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
  const prepared = await FileSystem.getInfoAsync(image.uri);
  if (!prepared.exists || !prepared.size || prepared.size > UPLOAD_MAX_BYTES) throw new Error('Billedet er for stort efter klargøring. Vælg et mindre billede.');
  return { uri: image.uri };
}

export async function prepareFanActivityCoverChange(
  selection: FanActivityCoverSelection | null | undefined, communityId: string, type: string,
): Promise<{ patch: { cover_url?: string | null }; uploadedPath?: string }> {
  if (selection === undefined) return { patch: {} };
  if (type !== 'bustur') throw new Error('Cover kan kun ændres her for en Bustur.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Din session er udløbet.');
  const { data: allowed, error } = await supabase.rpc('can_manage_fan_activity_v1', { p_community_id: communityId, p_type: type, p_user_id: auth.user.id });
  if (error || allowed !== true) throw new Error('Du har ikke adgang til at ændre denne fanaktivitet.');
  if (selection === null) return { patch: { cover_url: null } };
  const info = await FileSystem.getInfoAsync(selection.uri);
  if (!info.exists || !info.size || info.size > UPLOAD_MAX_BYTES) throw new Error('Billedfilen kunne ikke læses eller er for stor.');
  const binary = atob(await FileSystem.readAsStringAsync(selection.uri, { encoding: FileSystem.EncodingType.Base64 }));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (bytes.length < 4 || bytes.length > UPLOAD_MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error('Billedfilen er ikke et gyldigt JPEG.');
  const path = `${auth.user.id}/fan-activity-covers/${Crypto.randomUUID()}.jpg`;
  const bucket = supabase.storage.from(FAN_ACTIVITY_COVER_BUCKET);
  const uploaded = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (uploaded.error) throw new Error('Coveret kunne ikke uploades. Prøv igen.');
  return { patch: { cover_url: bucket.getPublicUrl(path).data.publicUrl }, uploadedPath: path };
}

export async function discardUnattachedFanActivityCover(path?: string) {
  // Only an upload from this failed save; never delete an older/shared cover.
  if (path) await supabase.storage.from(FAN_ACTIVITY_COVER_BUCKET).remove([path]).catch(() => undefined);
}
