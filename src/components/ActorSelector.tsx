import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';
import { Actor } from '../types/news';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { getMyCommunityRoles, canPostAsCommunity } from '../services/rbac';

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
  const { user } = useAuth();
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
    onSelectActor({
      type: 'user',
      id: user.id,
      name: user.email || 'Dig',
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
            color={colors.text}
          />
          <Text style={styles.selectedText}>{selectedActor.name}</Text>
        </View>
        <Ionicons
          name={showDropdown ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.subtext}
        />
      </Pressable>

      {showDropdown && (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.dropdownItem}>
              <ActivityIndicator size="small" color={colors.fcnRed} />
            </View>
          ) : (
            <>
              <Pressable style={styles.dropdownItem} onPress={handleSelectUser}>
                <Ionicons name="person" size={20} color={colors.text} />
                <Text style={styles.dropdownText}>{user?.email || 'Dig selv'}</Text>
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
                      <Ionicons name="people" size={20} color={colors.text} />
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

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedActor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectedText: {
    fontSize: 16,
    color: colors.text,
  },
  dropdown: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
  },
  dropdownText: {
    fontSize: 16,
    color: colors.text,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  dropdownHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
  },
  roleLabel: {
    fontSize: 12,
    color: colors.subtext,
    marginLeft: 'auto',
  },
});
