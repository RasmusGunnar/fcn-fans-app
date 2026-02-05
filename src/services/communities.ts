import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Alert } from 'react-native';

// ===== TYPES =====

export interface Community {
  id: string;
  name: string;
  description: string | null;
  type: 'community' | 'fan_faction';
  owner_id: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
  avatar_kind: 'logo' | 'image' | null;
  visibility: 'public' | 'private';
  created_at: string;
  created_by: string | null;
  member_count?: number;
}

export interface CommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

/**
 * Ensure avatar_url is populated from avatar_path if missing
 */
function ensureAvatarUrl(community: Community): Community {
  if (community.avatar_path && !community.avatar_url) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(community.avatar_path);
    community.avatar_url = data.publicUrl;
  }
  return community;
}

// ===== HELPER FUNCTIONS =====

/**
 * Convert base64 string to Uint8Array for reliable Supabase uploads
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
 * Generate crypto-random filename component
 */
async function cryptoRandom(): Promise<string> {
  return Crypto.randomUUID();
}

// ===== API FUNCTIONS =====

/**
 * Get member count for a community
 */
export async function getMemberCount(communityId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId);

    if (error) {
      console.warn('[communities] Error fetching member count:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return 0;
  }
}

/**
 * Get member counts for multiple communities
 * Returns a map of community_id -> member count
 */
export async function getMemberCounts(communityIds: string[]): Promise<Record<string, number>> {
  try {
    if (communityIds.length === 0) return {};

    const { data, error } = await supabase
      .from('community_members')
      .select('community_id')
      .in('community_id', communityIds);

    if (error) {
      console.warn('[communities] Error fetching member counts:', error);
      return {};
    }

    // Count members per community
    const counts: Record<string, number> = {};
    (data || []).forEach((member) => {
      counts[member.community_id] = (counts[member.community_id] || 0) + 1;
    });

    return counts;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return {};
  }
}

/**
 * Get all public communities
 */
export async function getCommunities(): Promise<Community[]> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('visibility', 'public')
      .order('name', { ascending: true });

    if (error) {
      console.warn('[communities] Error fetching communities:', error);
      return [];
    }

    // Ensure avatar_url is populated for each community
    const communities = (data || []).map(ensureAvatarUrl);

    // Fetch member counts for all communities
    const communityIds = communities.map((c) => c.id);
    const memberCounts = await getMemberCounts(communityIds);

    // Attach member counts to communities
    return communities.map((community) => ({
      ...community,
      member_count: memberCounts[community.id] || 0,
    }));
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return [];
  }
}

/**
 * Get single community by ID
 */
export async function getCommunity(id: string): Promise<Community | null> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn('[communities] Error fetching community:', error);
      return null;
    }

    // Ensure avatar_url is populated
    return data ? ensureAvatarUrl(data) : null;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Get current user's membership for a community
 */
export async function getMembership(communityId: string): Promise<CommunityMembership | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[communities] User not authenticated');
      return null;
    }

    const { data, error } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[communities] Error fetching membership:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Join a community (as member)
 */
export async function joinCommunity(communityId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[communities] User not authenticated');
      return false;
    }

    const { error } = await supabase.from('community_members').insert({
      community_id: communityId,
      user_id: user.id,
      role: 'member',
    });

    if (error) {
      console.error('[communities] Error joining community:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * Create a new community with proper ownership setup
 * @param name - Community name (required)
 * @param description - Community description (optional)
 * @param type - Community type ('community' or 'fan_faction')
 * @param visibility - Visibility ('public' or 'private')
 * @returns Created community or null on error
 */
export async function createCommunity(
  name: string,
  description: string | null,
  type: 'community' | 'fan_faction' = 'community',
  visibility: 'public' | 'private' = 'public',
): Promise<Community | null> {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[communities] User not authenticated');
      return null;
    }

    // Create community with owner_id set
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        type,
        owner_id: user.id,
        visibility,
        created_by: user.id,
      })
      .select()
      .single();

    if (communityError) {
      console.error('[communities] Error creating community:', communityError);
      return null;
    }

    // Create owner membership record (defensive check for duplicates)
    const { error: membershipError } = await supabase
      .from('community_members')
      .insert({
        community_id: community.id,
        user_id: user.id,
        role: 'owner',
      })
      .select()
      .single();

    if (membershipError) {
      // Check if it's a duplicate error (constraint violation)
      if (membershipError.code === '23505') {
        console.log('[communities] Owner membership already exists');
      } else {
        console.error('[communities] Error creating owner membership:', membershipError);
        // Continue anyway - community is created, membership can be fixed later
      }
    }

    console.log('[communities] Successfully created community:', {
      id: community.id,
      name: community.name,
      owner_id: community.owner_id,
    });

    return ensureAvatarUrl(community);
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Leave a community (delete membership)
 */
export async function leaveCommunity(communityId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[communities] User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', user.id);

    if (error) {
      console.warn('[communities] Error leaving community:', error);
      return false;
    }

    console.log('[communities] Successfully left community:', communityId);
    return true;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * List all members of a community (with profile info if available)
 */
export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  try {
    // First get memberships
    const { data: memberships, error: memberError } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .order('joined_at', { ascending: false });

    if (memberError) {
      console.warn('[communities] Error fetching members:', memberError);
      return [];
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    // Get profile info for all members
    const userIds = memberships.map((m) => m.user_id);
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    if (profileError) {
      console.warn('[communities] Error fetching profiles:', profileError);
      // Return without profile info
      return memberships;
    }

    // Merge memberships with profiles
    const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    return memberships.map((m) => {
      const profile = profilesMap.get(m.user_id);
      return {
        ...m,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
      };
    });
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return [];
  }
}

/**
 * Set member role (owner only)
 * @param communityId - The community ID
 * @param userId - The user ID to update
 * @param role - New role ('admin' or 'member')
 */
export async function setMemberRole(
  communityId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('community_members')
      .update({ role })
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (error) {
      console.warn('[communities] Error updating member role:', error);
      return false;
    }

    console.log('[communities] Successfully updated role:', { userId, role });
    return true;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * Upload community avatar (logo or image)
 * @param communityId - The community ID
 * @param fileUri - Optional file URI (if not provided, launches image picker)
 * @param kind - Avatar kind ('logo' for fan_faction, 'image' for community)
 */
export async function uploadCommunityAvatar(
  communityId: string,
  fileUri: string | null,
  kind: 'logo' | 'image',
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[communities] User not authenticated');
      return false;
    }

    let pickedUri = fileUri;

    // If no URI provided, launch image picker
    if (!pickedUri) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[communities] Permission denied');
        return false;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: false,
      });

      if (result.canceled) {
        return false;
      }

      pickedUri = result.assets[0].uri;
    }

    // Validate file exists
    const fileInfo = await FileSystem.getInfoAsync(pickedUri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      Alert.alert('Fejl', 'Filen kunne ikke findes eller er tom');
      return false;
    }

    console.log('[communities] Converting image to JPEG');

    // Convert to JPEG
    const manipResult = await ImageManipulator.manipulateAsync(
      pickedUri,
      [{ resize: { width: 512 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    const base64 = manipResult.base64;

    if (!base64) {
      throw new Error('Failed to get base64 data from image');
    }

    // Generate storage path
    const fileName = `${await cryptoRandom()}.jpg`;
    const path = `${communityId}/${fileName}`;

    console.log('[communities] Uploading to avatars bucket:', path);

    // Upload to avatars bucket (reuse existing bucket)
    const arrayBuffer = base64ToUint8Array(base64);
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[communities] Upload error:', uploadError);
      Alert.alert('Fejl', 'Upload fejlede. Prøv igen.');
      return false;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);

    // Update community record
    const { error: updateError } = await supabase
      .from('communities')
      .update({
        avatar_path: path,
        avatar_url: publicUrl,
        avatar_kind: kind,
      })
      .eq('id', communityId);

    if (updateError) {
      console.error('[communities] Update error:', updateError);
      Alert.alert('Fejl', 'Kunne ikke opdatere community. Prøv igen.');
      return false;
    }

    console.log('[communities] Successfully uploaded avatar:', { communityId, path, kind });
    return true;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    Alert.alert('Fejl', 'Noget gik galt. Prøv igen.');
    return false;
  }
}

/**
 * Update community name and/or description
 */
export async function updateCommunity(
  communityId: string,
  updates: { name?: string; description?: string | null },
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('communities')
      .update({
        ...(updates.name !== undefined && { name: updates.name.trim() }),
        ...(updates.description !== undefined && {
          description: updates.description?.trim() || null,
        }),
      })
      .eq('id', communityId);

    if (error) {
      console.error('[communities] Error updating community:', error);
      return false;
    }

    console.log('[communities] Successfully updated community:', communityId);
    return true;
  } catch (err) {
    console.error('[communities] Unexpected error:', err);
    return false;
  }
}
