import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getCommunities, type Community } from '../../services/communities';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/profile';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingCommunities'>;

type CommunityWithAvatar = Community & {
  avatarUrl?: string | null;
  imageUrl?: string | null;
};

export default function OnboardingCommunitiesSetupScreen({ route }: Props) {
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
      try {
        setSaving(true);

        if (!user?.id) {
          throw new Error('Bruger mangler');
        }

        const ensured = await ensureProfile(user.id);
        if (!ensured) {
          throw new Error('Kunne ikke sikre profil');
        }

        if (!skipSelection && selectedIds.size > 0) {
          const membershipRows = Array.from(selectedIds).map((communityId) => ({
            community_id: communityId,
            user_id: user.id,
          }));

          const { error: membershipError } = await supabase
            .from('community_members')
            .upsert(membershipRows, { onConflict: 'community_id,user_id' });

          if (membershipError) {
            throw membershipError;
          }
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update({ onboarding_complete: true })
          .eq('id', user.id);

        if (profileError) {
          throw profileError;
        }

        // RootNavigator / auth-flow should now let the user into the app.
      } catch (error) {
        Alert.alert('Fejl', 'Kunne ikke færdiggøre onboarding. Prøv igen.');
      } finally {
        setSaving(false);
      }
    },
    [selectedIds, user?.id]
  );

  const handleSkip = useCallback(() => {
    void finishOnboarding(true);
  }, [finishOnboarding]);

  const handleContinue = useCallback(() => {
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
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[4],
    },

    stepLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[2],
      textTransform: 'uppercase',
    },

    headline: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[3],
    },

    subtitle: {
      fontSize: 17,
      lineHeight: 26,
      color: theme.colors.textSecondary,
    },

    selectedSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: theme.spacing[6],
      marginBottom: theme.spacing[4],
    },

    summaryChip: {
      alignSelf: 'flex-start',
      borderRadius: 16,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.surfaceSecondary,
      marginRight: theme.spacing[2],
      marginBottom: theme.spacing[2],
    },

    summaryChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },

    listContainer: {
      flex: 1,
    },

    list: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[20],
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
      minHeight: 84,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      borderRadius: 18,
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
      width: 44,
      height: 44,
      borderRadius: 22,
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
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },

    communityContent: {
      flex: 1,
      justifyContent: 'center',
      marginRight: theme.spacing[3],
    },

    communityTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing[1],
    },

    communityDescription: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },

    followButton: {
      minWidth: 78,
      height: 36,
      borderRadius: 18,
      paddingHorizontal: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexShrink: 0,
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
      borderRadius: 24,
      paddingVertical: 14,
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
      color: theme.colors.white,
    },

    primaryButtonTextDisabled: {
      color: theme.colors.textSecondary,
    },
  });