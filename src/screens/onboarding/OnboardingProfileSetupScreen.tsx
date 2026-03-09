import React, { useMemo, useState } from 'react';
import { isCompactDevice } from '../../utils/isCompactDevice';
import { Alert, Image, Pressable, StyleSheet, TextInput, View, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import { useTheme } from '../../theme';
import { useAuth } from '../../auth/AuthProvider';
import { uploadAvatar } from '../../lib/uploadAvatar';
import { getPublicUrl } from '../../lib/storageUrl';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { ensureProfile } from '../../lib/profile';
import { Avatar } from '../../components/Avatar';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingProfile'>;

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
  const hasAvatar = !!avatarUrlInput;
  const appLogo = require('../../../assets/NewLogo.png');

  const canContinue = useMemo(() => {
    return displayNameInput.trim().length > 0 && !!avatarUrlInput && !saving;
  }, [displayNameInput, avatarUrlInput, saving]);

  const handleUploadAvatar = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    const avatarPath = await uploadAvatar(user.id);
    setUploadingAvatar(false);

    if (!avatarPath) {
      Alert.alert('Fejl', 'Kunne ikke uploade billede. Prøv igen.');
      return;
    }

    const publicUrl = avatarPath.startsWith('http')
      ? avatarPath
      : getPublicUrl('avatars', avatarPath);

    if (!publicUrl) {
      Alert.alert('Fejl', 'Kunne ikke hente billed-URL. Prøv igen.');
      return;
    }

    setAvatarUrlInput(publicUrl);
  };

  const handleContinue = async () => {
    if (!user?.id) return;
    const trimmedName = displayNameInput.trim();

    if (!trimmedName) {
      Alert.alert('Mangler kaldenavn', 'Indtast et kaldenavn for at fortsætte.');
      return;
    }

    if (!avatarUrlInput) {
      Alert.alert('Mangler profilbillede', 'Upload et profilbillede for at fortsætte.');
      return;
    }

    setSaving(true);
    try {
      await ensureProfile(user.id);

      const payload = {
        display_name: trimmedName,
        avatar_url: avatarUrlInput,
        onboarding_complete: false,
      };

      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

      if (updateError || !updated) {
        if (updateError) {
          logger.warn('[OnboardingProfile] Update failed, trying upsert:', updateError);
        }
        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (upsertError || !upserted) {
          logger.warn('[OnboardingProfile] Upsert failed:', upsertError);
          Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
          return;
        }
      }

      navigation.navigate('OnboardingCommunities');
    } catch (e) {
      logger.warn('[OnboardingProfile] Unexpected save error:', e);
      Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (navigation.getState()?.routeNames?.includes('Welcome')) {
      navigation.navigate('Welcome' as never);
      return;
    }
    // If no previous screen exists, do nothing rather than throwing warning
  };

  const compact = isCompactDevice();
  const Content = (
    <>
      <View style={styles.topNav}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      </View>

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
          Vælg et kaldenavn og et profilbillede, så andre fans kan kende dig.
        </Text>
      </View>

      <View style={styles.profileSection}>
        <Pressable onPress={handleUploadAvatar} style={styles.avatarTouchTarget}>
          <View style={styles.avatarSurface}>
            <Avatar
              userId={user?.id}
              avatarUrl={avatarUrlInput}
              size={theme.spacing[12] + theme.spacing[12]}
              label={displayNameInput || user?.email || 'Fan'}
            />
          </View>
          <Text style={styles.avatarHint}>
            {uploadingAvatar
              ? 'Henter billede...'
              : hasAvatar
                ? 'Skift profilbillede'
                : 'Vælg profilbillede'}
          </Text>
        </Pressable>

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
        </View>
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Gemmer...' : 'Fortsæt'}
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {compact ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>{Content}</View>
        </ScrollView>
      ) : (
        <View style={styles.content}>{Content}</View>
      )}
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
      paddingBottom: theme.spacing[4],
    },
    topNav: {
      minHeight: theme.spacing[11],
      justifyContent: 'center',
      marginBottom: theme.spacing[4],
    },
    backButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    backArrow: {
      fontSize: theme.typography.h1.fontSize,
      color: theme.colors.text.primary,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: theme.spacing[6],
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
      flex: 1,
      alignItems: 'center',
    },
    avatarSection: {
      alignItems: 'center',
      marginBottom: theme.spacing[6],
      justifyContent: 'center',
    },
    avatarTouchTarget: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 136,
      height: 136,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.surface,
      shadowColor: theme.colors.text.primary,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 2 },
      elevation: theme.elevation?.none ?? undefined,
      marginBottom: theme.spacing[1],
    },
    avatarSurface: {
      width: 112,
      height: 112,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.elevated,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
    },
      avatarHint: {
        marginTop: theme.spacing[3],
        fontSize: 14,
        color: theme.colors.text.secondary,
        textAlign: 'center',
      },
    inputSection: {
      width: '100%',
      marginTop: theme.spacing[7],
      marginBottom: theme.spacing[2],
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
    bottomActions: {
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[6],
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
      opacity: 0.4,
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.bg.surface,
    },
  });
