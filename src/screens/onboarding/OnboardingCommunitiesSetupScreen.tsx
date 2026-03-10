  // Helper for timeout-wrapped async calls
  async function withTimeout<T>(promise: Promise<T>, label: string, ms = 8000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      ),
    ]);
  }
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StackActions } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { useAuth } from '../../auth/AuthProvider';
import { getCommunities, type Community, joinCommunity } from '../../services/communities';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/profile';
import { logger } from '../../lib/logger';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingCommunities'>;

type CommunityWithAvatar = Community & {
  avatarUrl?: string | null;
  imageUrl?: string | null;
};

export default function OnboardingCommunitiesSetupScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();

  const step = route.params?.step ?? 2;
  const totalSteps = route.params?.totalSteps ?? 2;

  const [communities, setCommunities] = useState<CommunityWithAvatar[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canContinue = !saving;

  useEffect(() => {
    let isMounted = true;

    async function loadCommunities() {
      try {
        setLoading(true);
        const result = await getCommunities();

        if (!isMounted) return;

        setCommunities(Array.isArray(result) ? (result as CommunityWithAvatar[]) : []);
      } catch (error) {
        if (!isMounted) return;
        setCommunities([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadCommunities();

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

  const selectedCommunities = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return communities.filter((community) => selectedIds.has(community.id));
  }, [communities, selectedIds]);


  const finishOnboarding = useCallback(
    async (skipSelection: boolean) => {
      logger.log('[Onboarding] finishOnboarding start', { skipSelection, selectedIds: Array.from(selectedIds) });
      try {
        setSaving(true);

        logger.log('[Onboarding] finishOnboarding before user check');
        if (!user?.id) {
          throw new Error('Bruger mangler');
        }

        logger.log('[Onboarding] finishOnboarding before ensureProfile');
        const ensured = await withTimeout(ensureProfile(user.id), 'ensureProfile');
        logger.log('[Onboarding] finishOnboarding after ensureProfile', { ensured });
        if (!ensured) {
          throw new Error('Kunne ikke sikre profil');
        }

        if (!skipSelection && selectedIds.size > 0) {
          logger.log('[Onboarding] finishOnboarding before joinCommunity loop', { count: selectedIds.size });
          const joinResults = await Promise.allSettled(
            Array.from(selectedIds).map(async (communityId) => {
              try {
                const result = await joinCommunity(communityId);
                if (!result) {
                  // joinCommunity logger already logs error, but we want to know which community failed
                  throw new Error('joinCommunity returned false');
                }
                return { communityId, success: true };
              } catch (err: any) {
                // Check for duplicate/already-member error string
                const msg = err?.message?.toLowerCase?.() || '';
                if (msg.includes('duplicate') || msg.includes('already') || msg.includes('conflict')) {
                  logger.warn('[Onboarding] joinCommunity duplicate/already-member', { communityId, error: err });
                  return { communityId, success: true, duplicate: true };
                } else {
                  logger.error('[Onboarding] joinCommunity failed', { communityId, error: err });
                  throw err;
                }
              }
            })
          );
          // If any join failed (not duplicate), throw error
          const failed = joinResults.find(r => r.status === 'rejected');
          if (failed) {
            throw new Error('Kunne ikke tilføje til alle fællesskaber');
          }
        }

        logger.log('[Onboarding] finishOnboarding before profile update');
        const { data: updatedProfile, error: profileError } = await withTimeout(
          supabase
            .from('profiles')
            .update({ onboarding_complete: true })
            .eq('id', user.id)
            .select('id, display_name, onboarding_complete')
            .single(),
          'profile-update'
        );
        logger.log('[Onboarding] finishOnboarding after profile update', { updatedProfile, profileError });
        if (profileError) {
          throw profileError;
        }
        if (!updatedProfile) {
          throw new Error('Profile update did not return a row');
        }

        logger.log('[Onboarding] finishOnboarding before verification read');
        const { data: verifyProfile, error: verifyError } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, display_name, onboarding_complete')
            .eq('id', user.id)
            .single(),
          'profile-verification'
        );
        logger.log('[Onboarding] verification read', { verifyProfile, verifyError });
        if (verifyError) {
          throw verifyError;
        }
        if (!verifyProfile || verifyProfile.onboarding_complete !== true) {
          throw new Error('Profile verification failed: onboarding_complete is not true');
        }

        logger.log('[Onboarding] finishOnboarding before remount root-flow');
        // Remount root-flow so user is taken directly to main app
        const parent = navigation.getParent?.();
        if (parent) {
          parent.dispatch(StackActions.replace('Main'));
        } else {
          logger.error('[Onboarding] No parent navigator found when trying to remount root-flow');
          throw new Error('No parent navigator found');
        }
      } catch (error: any) {
        logger.error('[Onboarding] finishOnboarding error', { message: error?.message, error });
        Alert.alert('Fejl', 'Kunne ikke færdiggøre onboarding. Prøv igen.');
      } finally {
        setSaving(false);
      }
    },
    [selectedIds, user?.id, navigation]
  );


  const handleSkip = useCallback(() => {
    logger.log('[Onboarding] handleSkip pressed');
    void finishOnboarding(true);
  }, [finishOnboarding]);

  const handleContinue = useCallback(() => {
    logger.log('[Onboarding] handleContinue pressed');
    void finishOnboarding(false);
  }, [finishOnboarding]);

  const renderItem = useCallback(
    ({ item }: { item: CommunityWithAvatar }) => {
      const selected = selectedIds.has(item.id);
      const avatarUri = item.avatarUrl || item.imageUrl || null;

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
            accessibilityRole="button"
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
        <Text style={styles.stepLabel}>
          Trin {step} af {totalSteps}
        </Text>
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
            renderItem={renderItem}
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
        <Pressable onPress={handleSkip} style={styles.skipButton} disabled={saving}>
          <Text style={styles.skipButtonText}>Spring over</Text>
        </Pressable>

        <Pressable
          onPress={handleContinue}
          style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
          disabled={!canContinue}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.primaryButtonText,
              !canContinue && styles.primaryButtonTextDisabled,
            ]}
          >
            {saving
              ? 'Gemmer...'
              : selectedIds.size > 0
              ? 'Fortsæt'
              : 'Fortsæt uden valg'}
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
      paddingTop: theme.spacing[7],
      paddingBottom: theme.spacing[2],
      alignItems: 'flex-start',
    },

    stepLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing[1],
      textTransform: 'uppercase',
      letterSpacing: 1,
    },

    headline: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[2],
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.textSecondary,
      fontWeight: '400',
      marginBottom: theme.spacing[2],
    },

    selectedSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: theme.spacing[6],
      marginBottom: theme.spacing[2],
      minHeight: theme.spacing[6],
    },

    summaryChip: {
      alignSelf: 'flex-start',
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      backgroundColor: theme.colors.surfaceSecondary,
      marginRight: theme.spacing[2],
      marginBottom: theme.spacing[1],
      minHeight: theme.spacing[5],
    },

    summaryChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },

    listContainer: {
      flex: 1,
      minHeight: 0,
    },

    list: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[2],
    },

    sectionLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
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
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing[2],
      minHeight: 72,
      shadowColor: undefined,
    },

    selectedCommunityCard: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceSecondary,
      shadowColor: undefined,
    },

    communityAvatar: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      overflow: 'hidden',
      marginRight: theme.spacing[4],
    },

    communityAvatarImage: {
      width: '100%',
      height: '100%',
    },

    communityAvatarInitials: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },

    communityContent: {
      flex: 1,
      justifyContent: 'center',
      marginRight: theme.spacing[2],
    },

    communityTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[1],
      letterSpacing: -0.2,
    },

    communityDescription: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      fontWeight: '400',
      opacity: 0.9,
    },

    followButton: {
      minWidth: 64,
      height: 32,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    followButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },

    selectedFollowButton: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    selectedFollowButtonText: {
      color: theme.colors.white,
    },

    bottomActions: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[5],
      paddingBottom: theme.spacing[8],
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      alignItems: 'center',
    },

    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[2],
      marginBottom: theme.spacing[3],
      width: '100%',
    },

    skipButtonText: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.colors.primary,
      textAlign: 'center',
      opacity: 0.9,
    },

    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      marginTop: theme.spacing[1],
    },

    primaryButtonDisabled: {
      backgroundColor: theme.colors.surfaceSecondary,
    },

    primaryButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.white,
    },

    primaryButtonTextDisabled: {
      color: theme.colors.textSecondary,
    },
  });