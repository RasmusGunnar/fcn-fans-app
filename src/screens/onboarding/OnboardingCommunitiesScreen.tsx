import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { logger } from '../../lib/logger';
import { ensureProfile } from '../../lib/profile';
import { getPublicUrl } from '../../lib/storageUrl';
import { supabase } from '../../lib/supabase';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';
import { fetchMyProfile } from '../../services/profileApi';
import { getCommunities, getMembership, joinCommunity, type Community } from '../../services/communities';
import { useTheme } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingCommunities'>;

type CommunityCardModel = Community & {
  imageUrl: string | null;
};

function isProfileCompleteForApp(
  profile:
    | {
        display_name?: string | null;
        avatar_url?: string | null;
        onboarding_complete?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  const hasDisplayName =
    typeof profile?.display_name === 'string' && profile.display_name.trim().length > 0;
  const hasAvatar =
    typeof profile?.avatar_url === 'string' && profile.avatar_url.trim().length > 0;

  if (!hasDisplayName) {
    return false;
  }

  if (profile?.onboarding_complete === true) {
    return true;
  }

  if (profile?.onboarding_complete === false) {
    return false;
  }

  return hasAvatar;
}

function isMissingOnboardingColumnError(error: unknown): boolean {
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  return message.toLowerCase().includes('onboarding_complete');
}

function sortSuggestedCommunities(communities: Community[]): Community[] {
  return [...communities].sort((a, b) => {
    const typeDiff = (a.type === 'fan_faction' ? 0 : 1) - (b.type === 'fan_faction' ? 0 : 1);
    if (typeDiff !== 0) return typeDiff;

    const aIsWildTigers = a.name?.trim().toLowerCase() === 'wild tigers' ? 0 : 1;
    const bIsWildTigers = b.name?.trim().toLowerCase() === 'wild tigers' ? 0 : 1;
    if (aIsWildTigers !== bIsWildTigers) return aIsWildTigers - bIsWildTigers;

    return (a.name ?? '').localeCompare(b.name ?? '', 'da');
  });
}

export default function OnboardingCommunitiesScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const step = route.params?.step ?? 2;
  const totalSteps = route.params?.totalSteps ?? 2;
  const [communities, setCommunities] = useState<CommunityCardModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    let isMounted = true;

    const loadCommunities = async () => {
      setLoading(true);
      try {
        const data = await getCommunities();
        if (!isMounted) return;

        const ordered = sortSuggestedCommunities(data).map((community) => ({
          ...community,
          imageUrl:
            community.avatar_url ||
            (community.avatar_path ? getPublicUrl('avatars', community.avatar_path) : null) ||
            (community.cover_path ? getPublicUrl('community-media', community.cover_path) : null),
        }));

        setCommunities(ordered);
      } catch (error) {
        logger.warn('[OnboardingCommunitiesScreen] Failed to load communities', error);
        if (isMounted) {
          setCommunities([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadCommunities();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(entranceTranslateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceOpacity, entranceTranslateY]);

  const selectedCommunities = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return communities.filter((community) => selectedIds.has(community.id));
  }, [communities, selectedIds]);

  const toggleSelected = (communityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(communityId)) {
        next.delete(communityId);
      } else {
        next.add(communityId);
      }
      return next;
    });
  };

  const completeOnboarding = async () => {
    if (!user?.id) {
      throw new Error('Missing authenticated user');
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    if (updateError && !isMissingOnboardingColumnError(updateError)) {
      throw updateError;
    }

    if (updateError) {
      logger.warn(
        '[OnboardingCommunitiesScreen] onboarding_complete update unavailable, continuing with legacy completion fallback',
        updateError,
      );
    } else {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.dispatch(StackActions.replace('Main'));
      }
      return;
    }

    const refreshedProfile = await fetchMyProfile(user.id);
    if (!isProfileCompleteForApp(refreshedProfile)) {
      throw new Error('Profile refresh did not confirm onboarding completion');
    }

    const parent = navigation.getParent?.();
    if (parent) {
      parent.dispatch(StackActions.replace('Main'));
    }
  };

  const handleContinue = async () => {
    if (!user?.id || saving) return;

    setSaving(true);
    try {
      const ensured = await ensureProfile(user.id);
      if (!ensured) {
        throw new Error('Could not ensure profile');
      }

      for (const communityId of selectedIds) {
        const existingMembership = await getMembership(communityId);
        if (existingMembership) {
          continue;
        }

        const joined = await joinCommunity(communityId);
        if (!joined) {
          throw new Error(`Failed to follow community ${communityId}`);
        }
      }

      await completeOnboarding();
    } catch (error) {
      logger.warn('[OnboardingCommunitiesScreen] Failed to complete onboarding', error);
      Alert.alert('Fejl', 'Kunne ikke fuldføre onboarding. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: entranceOpacity,
            transform: [{ translateY: entranceTranslateY }],
          },
        ]}
      >
        <View style={styles.header}>
          <Text variant="small" color="secondary">
            Trin {step} af {totalSteps}
          </Text>
          <Text variant="h1" style={styles.title}>
            Find dine fællesskaber
          </Text>
          <Text variant="body" color="secondary" style={styles.subtitle}>
            Vælg nogle fællesskaber at følge. Du kan altid ændre det senere.
          </Text>
        </View>

        <View style={styles.summarySection}>
          {selectedCommunities.length === 0 ? (
            <View style={styles.summaryChip}>
              <Text variant="small" color="secondary">
                Ingen valgt endnu
              </Text>
            </View>
          ) : (
            selectedCommunities.map((community) => (
              <View key={community.id} style={styles.summaryChip}>
                <Text variant="small">{community.name}</Text>
              </View>
            ))
          )}
        </View>

        <Text variant="bodyBold" style={styles.sectionTitle}>
          Foreslåede fællesskaber
        </Text>

        <View style={styles.listWrap}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {communities.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text variant="bodyBold">Ingen fællesskaber fundet</Text>
                  <Text variant="body" color="secondary" style={styles.emptyStateText}>
                    Du kan fortsætte nu og vælge fællesskaber senere.
                  </Text>
                </View>
              ) : (
                communities.map((community) => {
                  const isSelected = selectedIds.has(community.id);

                  return (
                    <View key={community.id} style={[styles.card, isSelected && styles.cardSelected]}>
                      <View style={styles.cardMedia}>
                        {community.imageUrl ? (
                          <Image source={{ uri: community.imageUrl }} style={styles.cardImage} />
                        ) : (
                          <Ionicons
                            name={community.type === 'fan_faction' ? 'star' : 'people'}
                            size={theme.components.icon.size.md}
                            color={theme.colors.text.secondary}
                          />
                        )}
                      </View>

                      <View style={styles.cardBody}>
                        <Text variant="bodyBold" style={styles.cardTitle} numberOfLines={1}>
                          {community.name}
                        </Text>
                        <Text variant="small" color="secondary" numberOfLines={2}>
                          {community.description || 'Ingen beskrivelse endnu'}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => toggleSelected(community.id)}
                        disabled={saving}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.followButton,
                          isSelected && styles.followButtonSelected,
                          saving && styles.followButtonDisabled,
                          pressed && styles.followButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.followButtonText,
                            isSelected && styles.followButtonTextSelected,
                          ]}
                        >
                          {isSelected ? 'Følger' : '+ Følg'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleContinue}
            disabled={saving}
            accessibilityRole="button"
            style={styles.skipButton}
          >
            <Text variant="body" color="secondary">
              Spring over
            </Text>
          </Pressable>

          <Pressable
            onPress={handleContinue}
            disabled={saving || loading}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              (saving || loading) && styles.primaryButtonDisabled,
              pressed && !saving && !loading && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Gemmer...' : 'Fortsæt'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.bg.canvas,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[7],
    },
    header: {
      gap: theme.spacing[3],
      marginBottom: theme.spacing[3],
    },
    title: {
      maxWidth: 340,
    },
    subtitle: {
      maxWidth: 340,
    },
    summarySection: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
      marginBottom: theme.spacing[3],
      minHeight: theme.spacing[7],
    },
    summaryChip: {
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
    },
    sectionTitle: {
      marginBottom: theme.spacing[2],
    },
    listWrap: {
      flex: 1,
      minHeight: 0,
      marginBottom: theme.spacing[0],
    },
    list: {
      flex: 1,
    },
    listContent: {
      gap: theme.spacing[2],
      paddingBottom: theme.spacing[5],
    },
    loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      borderRadius: theme.radius.xl,
      padding: theme.spacing[4],
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
      gap: theme.spacing[2],
    },
    emptyStateText: {
      maxWidth: 320,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.xl,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      gap: theme.spacing[2],
    },
    cardSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.bg.card,
      transform: [{ scale: 0.985 }],
    },
    cardMedia: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    cardBody: {
      flex: 1,
      gap: theme.spacing[1],
      minWidth: 0,
    },
    cardTitle: {
      marginBottom: theme.spacing[0],
    },
    followButton: {
      minWidth: 84,
      height: theme.spacing[8],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    followButtonSelected: {
      backgroundColor: theme.colors.brand.accent,
      borderColor: theme.colors.brand.accent,
    },
    followButtonDisabled: {
      opacity: 0.6,
    },
    followButtonPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.98 }],
    },
    followButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    followButtonTextSelected: {
      color: theme.colors.text.inverse,
    },
    footer: {
      paddingTop: theme.spacing[2],
      paddingBottom: theme.spacing[4],
      gap: theme.spacing[2],
      backgroundColor: theme.colors.bg.canvas,
      borderTopWidth: theme.layout.borderWidth,
      borderTopColor: theme.colors.border.subtle,
    },
    skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[2],
    },
    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.brand.accent,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text.inverse,
    },
    primaryButtonPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
  });
