import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { useAuth } from '../../auth/AuthProvider';
import { getCommunities, type Community } from '../../services/communities';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/profile';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingCommunities'>;

export default function OnboardingCommunitiesSetupScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedCount = selectedIds.size;
  const canContinue = !saving;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const result = await getCommunities();
        if (!isMounted) return;
        setCommunities(Array.isArray(result) ? result : []);
      } catch (error) {
        console.error('Failed to load communities', error);
        if (!isMounted) return;
        setCommunities([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleSelect = useCallback((communityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(communityId)) {
        next.delete(communityId);
      } else {
        next.add(communityId);
      }
      return next;
    });
  }, []);

  const getCommunityInitials = useCallback((name?: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }, []);

  const handleFinish = useCallback(
    async (skipSelection: boolean) => {
      try {
        setSaving(true);

        if (!user?.id) {
          throw new Error('Bruger mangler');
        }

        await ensureProfile(user.id);

        if (!skipSelection && selectedIds.size > 0) {
          const rows = Array.from(selectedIds).map((communityId) => ({
            community_id: communityId,
            user_id: user.id,
          }));

          const { error } = await supabase
            .from('community_members')
            .upsert(rows, { onConflict: 'community_id,user_id' });

          if (error) {
            throw error;
          }
        }

        navigation.replace('OnboardingProfile');
      } catch (error) {
        console.error('Failed to finish community onboarding', error);
      } finally {
        setSaving(false);
      }
    },
    [navigation, selectedIds, user?.id]
  );

  const handleSkip = useCallback(() => {
    void handleFinish(true);
  }, [handleFinish]);

  const handleContinue = useCallback(() => {
    void handleFinish(false);
  }, [handleFinish]);

  const selectedCommunities = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return communities.filter((community) => selectedIds.has(community.id));
  }, [communities, selectedIds]);

  const renderCommunityItem = useCallback(
    ({ item }: { item: Community }) => {
      const selected = selectedIds.has(item.id);
      const avatarUri =
        (item as Community & { avatarUrl?: string; imageUrl?: string }).avatarUrl ||
        (item as Community & { avatarUrl?: string; imageUrl?: string }).imageUrl ||
        null;

      return (
        <View style={[styles.communityCard, selected && styles.selectedCommunityCard]}>
          <View style={styles.communityAvatar}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.communityAvatarImage} />
            ) : (
              <Text style={styles.communityAvatarInitials}>
                {getCommunityInitials(item.name)}
              </Text>
            )}
          </View>

          <View style={styles.communityContent}>
            <Text style={styles.communityTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.communityDescription} numberOfLines={2}>
              {item.description || 'Ingen beskrivelse'}
            </Text>
          </View>

          <Pressable
            onPress={() => toggleSelect(item.id)}
            style={[styles.followButton, selected && styles.selectedFollowButton]}
          >
            <Text
              style={[
                styles.followButtonText,
                selected && styles.selectedFollowButtonText,
              ]}
            >
              {selected ? 'Følger' : 'Følg'}
            </Text>
          </Pressable>
        </View>
      );
    },
    [getCommunityInitials, selectedIds, styles, toggleSelect]
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.headerSection}>
        <Text style={styles.stepLabel}>Trin 2 af 2</Text>
        <Text style={styles.headline}>Find dine fællesskaber</Text>
        <Text style={styles.subtitle}>
          Vælg nogle fællesskaber at følge. Du kan altid ændre det senere.
        </Text>
      </View>

      <View style={styles.selectedSummaryRow}>
        {selectedCommunities.length === 0 ? (
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>Ingen valgt endnu</Text>
          </View>
        ) : (
          selectedCommunities.map((community) => (
            <View key={community.id} style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{community.name}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={communities}
            keyExtractor={(item) => item.id}
            renderItem={renderCommunityItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              communities.length > 0 ? (
                <Text style={styles.sectionLabel}>Foreslåede fællesskaber</Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Ingen fællesskaber fundet</Text>
                <Text style={styles.emptySubtitle}>
                  Du kan fortsætte nu og vælge fællesskaber senere.
                </Text>
              </View>
            }
          />
        )}
      </View>

      <View style={styles.bottomActions}>
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>Spring over</Text>
        </Pressable>

        <Pressable
          onPress={handleContinue}
          style={[
            styles.primaryButton,
            !canContinue && styles.primaryButtonDisabled,
          ]}
          disabled={!canContinue}
        >
          <Text
            style={[
              styles.primaryButtonText,
              !canContinue && styles.primaryButtonTextDisabled,
            ]}
          >
            {selectedIds.size > 0 ? 'Fortsæt' : 'Fortsæt uden valg'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    headerSection: {
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[4],
    },

    stepLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing[2],
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },

    headline: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[3],
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 17,
      lineHeight: 26,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing[1],
    },

    selectedSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: theme.spacing[6],
      marginBottom: theme.spacing[4],
      minHeight: 36,
      alignItems: 'center',
    },

    summaryChip: {
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.surfaceSecondary,
      marginRight: theme.spacing[2],
      marginBottom: theme.spacing[2],
      minHeight: 32,
      justifyContent: 'center',
    },

    summaryChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      letterSpacing: 0.1,
    },

    listContainer: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[20],
    },

    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing[3],
    },

    loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    emptyState: {
      borderRadius: theme.radius.xl,
      paddingHorizontal: theme.spacing[5],
      paddingVertical: theme.spacing[5],
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[2],
    },

    emptySubtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },

    communityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 88,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing[3],
    },

    selectedCommunityCard: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceSecondary,
    },

    communityAvatar: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      overflow: 'hidden',
      marginRight: theme.spacing[4],
      flexShrink: 0,
    },

    communityAvatarImage: {
      width: '100%',
      height: '100%',
    },

    communityAvatarInitials: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },

    communityContent: {
      flex: 1,
      justifyContent: 'center',
      marginRight: theme.spacing[3],
    },

    communityTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[1],
    },

    communityDescription: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },

    followButton: {
      minWidth: 84,
      height: 38,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexShrink: 0,
    },

    followButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },

    selectedFollowButton: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    selectedFollowButtonText: {
      color: theme.colors.onPrimary,
    },

    bottomActions: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[6],
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },

    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[2],
      marginBottom: theme.spacing[2],
    },

    skipButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.primary,
    },

    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },

    primaryButtonDisabled: {
      backgroundColor: theme.colors.surfaceSecondary,
    },

    primaryButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onPrimary,
    },

    primaryButtonTextDisabled: {
      color: theme.colors.textSecondary,
    },
      list: {
        flex: 1,
      },
  });