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
  accentColor?: string;
}

interface EligibleCommunity {
  id: string;
  name: string;
  role: 'owner' | 'admin';
}

export function ActorSelector({ selectedActor, onSelectActor, accentColor }: ActorSelectorProps) {
  const theme = useTheme();
  const resolvedAccentColor = accentColor ?? theme.colors.primary;
  const styles = createStyles(theme, resolvedAccentColor);
  const { user } = useAuth();
  const { profileMap } = useFeed();
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
  };

  const handleSelectCommunity = (community: EligibleCommunity) => {
    onSelectActor({
      type: 'community',
      id: community.id,
      name: community.name,
    });
  };

  const hasEligibleCommunities = eligibleCommunities.length > 0;
  const userDisplayName = resolveProfileDisplayName(profileMap, user?.id, user?.email || undefined);
  const actorOptions: Actor[] = [
    ...(user
      ? [
          {
            type: 'user' as const,
            id: user.id,
            name: userDisplayName,
          },
        ]
      : []),
    ...eligibleCommunities.map((community) => ({
      type: 'community' as const,
      id: community.id,
      name: community.name,
    })),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Opslå som</Text>
      <View style={styles.chipWrap}>
        {actorOptions.map((actorOption) => {
          const isSelected =
            selectedActor.type === actorOption.type && selectedActor.id === actorOption.id;

          return (
            <Pressable
              key={`${actorOption.type}:${actorOption.id}`}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
              onPress={() =>
                actorOption.type === 'user'
                  ? handleSelectUser()
                  : handleSelectCommunity(
                      eligibleCommunities.find((community) => community.id === actorOption.id)!,
                    )
              }
            >
              <Ionicons
                name={actorOption.type === 'user' ? 'person' : 'people'}
                size={14}
                color={isSelected ? accentColor : theme.colors.text.secondary}
              />
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {actorOption.name}
              </Text>
            </Pressable>
          );
        })}

        {loading && (
          <View style={styles.loadingChip}>
            <ActivityIndicator size="small" color={accentColor} />
          </View>
        )}

        {!loading && !user && !hasEligibleCommunities && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Ingen tilgængelige afsendere</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(theme: Theme, accentColor: string) {
  return StyleSheet.create({
    container: {
      marginBottom: theme.spacing[3],
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      minHeight: 34,
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    chipSelected: {
      borderColor: accentColor,
      backgroundColor: theme.colors.bg.subtle,
    },
    chipPressed: {
      opacity: 0.88,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.text.primary,
    },
    chipTextSelected: {
      color: accentColor,
      fontWeight: '600',
    },
    loadingChip: {
      minHeight: 34,
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      paddingVertical: theme.spacing[2],
    },
    emptyStateText: {
      fontSize: 12,
      color: theme.colors.text.secondary,
    },
  });
}
