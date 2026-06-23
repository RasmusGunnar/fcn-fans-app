import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { Avatar } from '../../components/Avatar';
import { Text } from '../../components/ui';
import { logger } from '../../lib/logger';
import { ensureProfile } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { uploadAvatar } from '../../lib/uploadAvatar';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';
import { fetchMyProfile } from '../../services/profileApi';
import { useTheme } from '../../theme';
import { normalizeDisplayNameToUsername } from '../../utils/username';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingProfile'>;

function isUsernameConflictError(error: any): boolean {
  const message = String(error?.message ?? '').toLowerCase();
  const details = String(error?.details ?? '').toLowerCase();

  return (
    error?.code === '23505' &&
    (message.includes('profiles_username_unique_idx') ||
      details.includes('profiles_username_unique_idx') ||
      message.includes('username') ||
      details.includes('username'))
  );
}

export default function OnboardingProfileSetupScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const step = route.params?.step ?? 1;
  const totalSteps = route.params?.totalSteps ?? 2;

  const [displayNameInput, setDisplayNameInput] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceTranslateY = useRef(new Animated.Value(10)).current;
  const hasAvatar = !!avatarUrlInput;
  const appLogo = require('../../../assets/NewLogo.png');
  const { width, height } = useWindowDimensions();

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

  useEffect(() => {
    let isMounted = true;

    const loadExistingProfile = async () => {
      if (!user?.id) return;

      const profile = await fetchMyProfile(user.id);
      if (!isMounted || !profile) return;

      if (profile.display_name?.trim()) {
        setDisplayNameInput((prev) =>
          prev.trim().length > 0 ? prev : (profile.display_name ?? ''),
        );
      }

      if (profile.avatar_url) {
        setAvatarUrlInput((prev) => prev ?? profile.avatar_url ?? null);
      }
    };

    void loadExistingProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const canContinue = useMemo(() => {
    return displayNameInput.trim().length > 0 && !saving;
  }, [displayNameInput, saving]);

  const handleUploadAvatar = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    const avatarPath = await uploadAvatar(user.id);
    setUploadingAvatar(false);

    if (!avatarPath) {
      Alert.alert(
        'Billedet blev ikke uploadet',
        'Du kan fortsætte uden profilbillede og tilføje det senere fra din profil.',
      );
      return;
    }

    setAvatarUrlInput(avatarPath);
  };

  const handleContinue = async () => {
    if (!user?.id) return;
    const trimmedName = displayNameInput.trim();
    const normalizedUsername = normalizeDisplayNameToUsername(trimmedName);

    if (!trimmedName) {
      Alert.alert('Mangler kaldenavn', 'Indtast et kaldenavn for at fortsætte.');
      return;
    }

    if (!normalizedUsername) {
      Alert.alert(
        'Ugyldigt kaldenavn',
        'Kaldenavnet skal indeholde mindst ét bogstav eller tal for at kunne bruges i mentions.',
      );
      return;
    }

    setSaving(true);
    try {
      await ensureProfile(user.id);

      const basePayload = {
        display_name: trimmedName,
        username: normalizedUsername,
        avatar_url: avatarUrlInput,
      };
      const payloads = [{ ...basePayload, onboarding_complete: false }, basePayload];
      let saved = false;

      for (const payload of payloads) {
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', user.id)
          .select('id')
          .maybeSingle();

        if (!updateError && updated) {
          saved = true;
          break;
        }

        if (isUsernameConflictError(updateError)) {
          Alert.alert('Kaldenavn optaget', 'Det kaldenavn er allerede i brug.');
          return;
        }

        if (updateError) {
          logger.warn('[OnboardingProfile] Update failed, trying upsert:', updateError);
        }

        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (!upsertError && upserted) {
          saved = true;
          break;
        }

        if (isUsernameConflictError(upsertError)) {
          Alert.alert('Kaldenavn optaget', 'Det kaldenavn er allerede i brug.');
          return;
        }

        if (upsertError) {
          logger.warn('[OnboardingProfile] Upsert failed:', upsertError);
        }
      }

      if (!saved) {
        Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
        return;
      }

      navigation.navigate('OnboardingCommunities');
    } catch (e) {
      logger.warn('[OnboardingProfile] Unexpected save error:', e);
      Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  const shortestSide = Math.min(width, height);
  const compact = shortestSide < 700;
  const isTabletLayout = shortestSide >= 700;
  const Content = (
    <>
      {/* Removed manual back button from onboarding profile setup */}
      <Animated.View
        style={{
          opacity: entranceOpacity,
          transform: [{ translateY: entranceTranslateY }],
        }}
      >
        <View style={styles.heroSection}>
          <View style={styles.brandMark}>
            <View style={styles.logoSurface}>
              <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
            </View>
          </View>
          <Text variant="small" color="secondary">
            Trin {step} af {totalSteps}
          </Text>
          <Text variant="h1" style={styles.headline}>
            Gør profilen til din
          </Text>
          <Text variant="body" color="secondary" style={styles.subtitle}>
            Vælg et kaldenavn. Du kan også tilføje et profilbillede, så andre fans kan kende dig.
          </Text>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatarPicker}>
            <Pressable onPress={handleUploadAvatar} style={styles.avatarTouchTarget}>
              <View style={styles.avatarSurface}>
                <Avatar
                  userId={user?.id}
                  avatarUrl={avatarUrlInput}
                  size={theme.spacing[11] + theme.spacing[11]}
                  label={displayNameInput || user?.email || 'Fan'}
                />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>
              {uploadingAvatar
                ? 'Henter billede...'
                : hasAvatar
                  ? 'Skift profilbillede'
                  : 'Vælg profilbillede (valgfrit)'}
            </Text>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Kaldenavn</Text>
            <TextInput
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Dit kaldenavn"
              placeholderTextColor={theme.colors.text.secondary}
              style={styles.displayNameInput}
              editable={!saving}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={32}
            />
            <Text style={styles.inputHint}>Dit kaldenavn bruges også til @mentions.</Text>
          </View>
        </View>

        <View style={styles.bottomActions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              !canContinue && styles.primaryButtonDisabled,
              pressed && canContinue && styles.primaryButtonPressed,
            ]}
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Gemmer...' : 'Fortsæt'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, compact && styles.compactScrollContent]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content, isTabletLayout && styles.tabletContent]}>{Content}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.bg.canvas,
    },
    keyboardAvoidingView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    compactScrollContent: {
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[4],
    },
    tabletContent: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: theme.spacing[4],
      gap: theme.spacing[2],
    },
    brandMark: {
      marginBottom: theme.spacing[2],
    },
    logoSurface: {
      width: theme.spacing[8] + theme.spacing[8],
      height: theme.spacing[8] + theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
    },
    logoImage: {
      width: theme.spacing[10],
      height: theme.spacing[10],
    },
    headline: {
      textAlign: 'center',
    },
    subtitle: {
      textAlign: 'center',
      maxWidth: theme.spacing[16] + theme.spacing[16] + theme.spacing[16],
    },
    profileSection: {
      alignItems: 'center',
      marginBottom: theme.spacing[4],
      width: '100%',
    },
    avatarPicker: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarTouchTarget: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 112,
      height: 112,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.surface,
      shadowColor: theme.colors.text.primary,
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: theme.elevation.sm.android,
    },
    avatarSurface: {
      width: 96,
      height: 96,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
    },
    avatarHint: {
      marginTop: theme.spacing[2],
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: 'center',
    },
    inputSection: {
      width: '100%',
      marginTop: theme.spacing[5],
      marginBottom: theme.spacing[1],
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    displayNameInput: {
      width: '100%',
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      color: theme.colors.text.primary,
    },
    inputHint: {
      marginTop: theme.spacing[2],
      fontSize: theme.typography.caption.fontSize,
      color: theme.colors.text.secondary,
    },
    bottomActions: {
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[1],
      paddingBottom: theme.spacing[4],
    },
    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.brand.accent,
    },
    primaryButtonDisabled: {
      opacity: 0.4,
    },
    primaryButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.bg.surface,
    },
    primaryButtonPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
  });
