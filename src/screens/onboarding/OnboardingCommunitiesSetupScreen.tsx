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

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

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
      } catch {
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
      logger.log('[Onboarding] finishOnboarding start', {
        skipSelection,
        selectedIds: Array.from(selectedIds),
      });

      try {
        setSaving(true);

        if (!user?.id) {
          throw new Error('Bruger mangler');
        }

        const ensured = await withTimeout(ensureProfile(user.id), 'ensureProfile');
        logger.log('[Onboarding] finishOnboarding after ensureProfile', { ensured });

        if (!ensured) {
          throw new Error('Kunne ikke sikre profil');
        }

        if (!skipSelection && selectedIds.size > 0) {
          const joinResults = await Promise.allSettled(
            Array.from(selectedIds).map(async (communityId) => {
              try {
                const result = await joinCommunity(communityId);
                if (!result) {
                  throw new Error('joinCommunity returned false');
                }
                return { communityId, success: true };
              } catch (err: any) {
                const msg = err?.message?.toLowerCase?.() || '';

                if (
                  msg.includes('duplicate') ||
                  msg.includes('already') ||
                  msg.includes('conflict')
                ) {
                  logger.warn('[Onboarding] joinCommunity duplicate/already-member', {
                    communityId,
                    error: err,
                  });
                  return { communityId, success: true, duplicate: true };
                }

                logger.error('[Onboarding] joinCommunity failed', {
                  communityId,
                  error: err,
                });
                throw err;
              }
            }),
          );

          const failed = joinResults.find((r) => r.status === 'rejected');
          if (failed) {
            throw new Error('Kunne ikke tilføje til alle fællesskaber');
          }
        }

        const { data: updatedProfile, error: profileError } = await withTimeout(
          supabase
            .from('profiles')
            .update({ onboarding_complete: true })
            .eq('id', user.id)
            .select('id, display_name, onboarding_complete')
            .single(),
          'profile-update',
        );

        if (profileError) {
          throw profileError;
        }

        if (!updatedProfile) {
          throw new Error('Profile update did not return a row');
        }

        const { data: verifyProfile, error: verifyError } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, display_name, onboarding_complete')
            .eq('id', user.id)
            .single(),
          'profile-verification',
        );

        if (verifyError) {
          throw verifyError;
        }

        if (!verifyProfile || verifyProfile.onboarding_complete !== true) {
          throw new Error('Profile verification failed: onboarding_complete is not true');
        }

        const parent = navigation.getParent?.();

        if (parent) {
          parent.dispatch(StackActions.replace('Main'));
        } else {
          logger.error(
            '[Onboarding] No parent navigator found when trying to remount root-flow',
          );
          throw new Error('No parent navigator found');
        }
      } catch (error: any) {
        logger.error('[Onboarding] finishOnboarding error', {
          message: error?.message,
          error,
        });
        Alert.alert('Fejl', 'Kunne ikke færdiggøre onboarding. Prøv igen.');
      } finally {
        setSaving(false);
      }
    },
    [navigation, selectedIds, user?.id],
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
        <Pressable
          onPress={() => toggleSelect(item.id)}
          style={[styles.card, selected && styles.cardSelected]}
          accessibilityRole="button"
        >
          <View style={styles.cardTopRow}>
            <View style={[styles.avatarWrap, selected && styles.avatarWrapSelected]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{getCommunityInitials(item.name)}</Text>
              )}
            </View>

            <View style={styles.cardTextColumn}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cardDescription} numberOfLines={2}>
                {item.description || 'Ingen beskrivelse'}
              </Text>
            </View>

            <View style={[styles.followChip, selected && styles.followChipSelected]}>
              <Text style={[styles.followChipText, selected && styles.followChipTextSelected]}>
                {selected ? 'Følger' : 'Følg'}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [getCommunityInitials, selectedIds, styles, toggleSelect],
  );

  const listHeader = (
    <View style={styles.headerWrap}>
      <Text style={styles.stepLabel}>
        Trin {step} af {totalSteps}
      </Text>
      <Text style={styles.headline}>Find dine fællesskaber</Text>
      <Text style={styles.subtitle}>
        Vælg nogle fællesskaber at følge. Du kan altid ændre det senere.
      </Text>

      <View style={styles.selectionPanel}>
        {selectedCommunities.length === 0 ? (
          <>
            <Text style={styles.selectionTitle}>Ingen valgt endnu</Text>
            <Text style={styles.selectionSubtitle}>
              Du kan vælge nogle nu eller fortsætte uden valg.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.selectionTitle}>Valgt lige nu</Text>
            <View style={styles.selectedChipsRow}>
              {selectedCommunities.map((community) => (
                <View key={community.id} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{community.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {communities.length > 0 ? (
        <Text style={styles.sectionLabel}>Foreslåede fællesskaber</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.main}>
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
            ListHeaderComponent={listHeader}
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

      <View style={styles.footer}>
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

    main: {
      flex: 1,
    },

    list: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[4],
    },

    headerWrap: {
      paddingTop: theme.spacing[6],
      paddingBottom: theme.spacing[5],
    },

    stepLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: theme.spacing[2],
    },

    headline: {
      fontSize: 31,
      lineHeight: 37,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.5,
      marginBottom: theme.spacing[3],
    },

    subtitle: {
      fontSize: 17,
      lineHeight: 26,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing[4],
    },

    selectionPanel: {
      borderRadius: theme.radius.xl,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      backgroundColor: theme.colors.surfaceSecondary,
      marginBottom: theme.spacing[5],
    },

    selectionTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[1],
    },

    selectionSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },

    selectedChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: theme.spacing[1],
    },

    selectedChip: {
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.surface,
      marginRight: theme.spacing[2],
      marginBottom: theme.spacing[2],
    },

    selectedChipText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },

    sectionLabel: {
      fontSize: 15,
      lineHeight: 22,
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
      lineHeight: 24,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[2],
    },

    emptySubtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },

    card: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      marginBottom: theme.spacing[3],
    },

    cardSelected: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderColor: theme.colors.primary,
    },

    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    avatarWrap: {
      width: 52,
      height: 52,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      overflow: 'hidden',
      marginRight: theme.spacing[4],
      flexShrink: 0,
    },

    avatarWrapSelected: {
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },

    avatarImage: {
      width: '100%',
      height: '100%',
    },

    avatarInitials: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.text,
    },

    cardTextColumn: {
      flex: 1,
      marginRight: theme.spacing[3],
    },

    cardTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[1],
      letterSpacing: -0.3,
    },

    cardDescription: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },

    followChip: {
      minWidth: 82,
      height: 38,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexShrink: 0,
    },

    followChipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    followChipText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },

    followChipTextSelected: {
      color: theme.colors.white,
    },

    footer: {
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[6],
      backgroundColor: theme.colors.background,
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
      lineHeight: 22,
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
      lineHeight: 24,
      fontWeight: '700',
      color: theme.colors.white,
    },

    primaryButtonTextDisabled: {
      color: theme.colors.textSecondary,
    },
  });