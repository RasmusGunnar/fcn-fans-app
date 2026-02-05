import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { Actor } from '../types/news';
import { useAuth } from '../auth/AuthProvider';
import { useFeed } from '../state/FeedContext';
import { supabase } from '../lib/supabase';
import { getMyCommunityRoles, canPostAsCommunity } from '../services/rbac';
import { resolveProfileDisplayName } from '../utils/actor';

interface ActorSelectorProps {
  selectedActor: Actor;
  onSelectActor: (actor: Actor) => void;
}

interface EligibleCommunity {
  id: string;
  name: string;
  role: 'owner' | 'admin';
}

export function ActorSelector({ selectedActor, onSelectActor }: ActorSelectorProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { profileMap } = useFeed();
  const [showDropdown, setShowDropdown] = useState(false);
  const [eligibleCommunities, setEligibleCommunities] = useState<EligibleCommunity[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCommunities = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Step 1: Get user's roles in all communities
      const roleMap = await getMyCommunityRoles();

      // Step 2: Filter to only communities where user can post (owner/admin)
      const eligibleIds = Object.entries(roleMap)
        .filter(([_, role]) => canPostAsCommunity(role))
        .map(([communityId]) => communityId);

      console.log('[ActorSelector] Eligible community IDs (owner/admin):', eligibleIds.length);

      if (eligibleIds.length === 0) {
        setEligibleCommunities([]);
        return;
      }

      // Step 3: Fetch community names
      const { data: communities, error } = await supabase
        .from('communities')
        .select('id, name')
        .in('id', eligibleIds);

      if (error) {
        console.error('[ActorSelector] Error fetching community names:', error);
        setEligibleCommunities([]);
        return;
      }

      const eligible: EligibleCommunity[] =
        communities?.map((c) => ({
          id: c.id,
          name: c.name,
          role: roleMap[c.id] as 'owner' | 'admin',
        })) || [];

      console.log('[ActorSelector] Loaded eligible communities:', eligible.length);
      setEligibleCommunities(eligible);
    } catch (error) {
      console.error('[ActorSelector] Failed to load communities:', error);
      setEligibleCommunities([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const handleSelectUser = () => {
    if (!user) return;
    const displayName = resolveProfileDisplayName(profileMap, user.id, user.email || undefined);
    onSelectActor({
      type: 'user',
      id: user.id,
      name: displayName,
    });
    setShowDropdown(false);
  };

  const handleSelectCommunity = (community: EligibleCommunity) => {
    onSelectActor({
      type: 'community',
      id: community.id,
      name: community.name,
    });
    setShowDropdown(false);
  };

  const hasEligibleCommunities = eligibleCommunities.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Opret som</Text>
      <Pressable style={styles.selector} onPress={() => setShowDropdown(!showDropdown)}>
        <View style={styles.selectedActor}>
          <Ionicons
            name={selectedActor.type === 'user' ? 'person' : 'people'}
            size={20}
            color={theme.colors.text.primary}
          />
          <Text style={styles.selectedText}>{selectedActor.name}</Text>
        </View>
        <Ionicons
          name={showDropdown ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.text.secondary}
        />
      </Pressable>

      {showDropdown && (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.dropdownItem}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : (
            <>
              <Pressable style={styles.dropdownItem} onPress={handleSelectUser}>
                <Ionicons name="person" size={20} color={theme.colors.text.primary} />
                <Text style={styles.dropdownText}>
                  {resolveProfileDisplayName(profileMap, user?.id, user?.email || undefined)}
                  <Text style={styles.dropdownLabel}> (Dig selv)</Text>
                </Text>
              </Pressable>

              {hasEligibleCommunities && (
                <>
                  <View style={styles.dropdownDivider} />
                  <Text style={styles.dropdownHeader}>Dine fællesskaber</Text>
                  {eligibleCommunities.map((community) => (
                    <Pressable
                      key={community.id}
                      style={styles.dropdownItem}
                      onPress={() => handleSelectCommunity(community)}
                    >
                      <Ionicons name="people" size={20} color={theme.colors.text.primary} />
                      <Text style={styles.dropdownText}>{community.name}</Text>
                      <Text style={styles.roleLabel}>
                        {community.role === 'owner' ? 'ejer' : 'admin'}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      marginBottom: theme.spacing[4],
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[1],
    },
    selector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing[4],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    selectedActor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    selectedText: {
      fontSize: 16,
      color: theme.colors.text.primary,
    },
    dropdown: {
      marginTop: theme.spacing[1],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      padding: theme.spacing[1],
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      padding: theme.spacing[4],
      borderRadius: theme.radius.sm,
    },
    dropdownText: {
      fontSize: 16,
      color: theme.colors.text.primary,
    },
    dropdownLabel: {
      color: theme.colors.text.secondary,
    },
    dropdownDivider: {
      height: 1,
      backgroundColor: theme.colors.border.default,
      marginVertical: theme.spacing[1],
    },
    dropdownHeader: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text.secondary,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[1],
      textTransform: 'uppercase',
    },
    roleLabel: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginLeft: 'auto',
    },
  });
}
