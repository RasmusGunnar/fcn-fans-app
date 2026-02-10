import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, Button, Card } from '../../components/ui';
import { useTheme } from '../../theme';
import { useAuth } from '../../auth/AuthProvider';
import { uploadAvatar } from '../../lib/uploadAvatar';
import { getPublicUrl } from '../../lib/storageUrl';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/profile';
import { Avatar } from '../../components/Avatar';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingProfile'>;

export default function OnboardingProfileSetupScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();

  const [displayNameInput, setDisplayNameInput] = useState('');
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

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
          console.warn('[OnboardingProfile] Update failed, trying upsert:', updateError);
        }
        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (upsertError || !upserted) {
          console.warn('[OnboardingProfile] Upsert failed:', upsertError);
          Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
          return;
        }
      }

      navigation.navigate('OnboardingCommunities');
    } catch (e) {
      console.warn('[OnboardingProfile] Unexpected save error:', e);
      Alert.alert('Fejl', 'Kunne ikke gemme profilen. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <View style={styles.header}>
        <Text variant="h1">Opsæt din profil</Text>
        <Text variant="body" color="secondary">
          Vi skal bruge et kaldenavn og et profilbillede.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="bodyBold" style={styles.label}>
          Kaldenavn
        </Text>
        <TextInput
          value={displayNameInput}
          onChangeText={setDisplayNameInput}
          placeholder="Dit kaldenavn"
          placeholderTextColor={theme.colors.text.secondary}
          style={styles.input}
          editable={!saving}
        />

        <Text variant="bodyBold" style={styles.label}>
          Profilbillede
        </Text>
        <View style={styles.avatarRow}>
          <Pressable onPress={handleUploadAvatar} style={styles.avatarButton}>
            <Avatar
              userId={user?.id}
              avatarUrl={avatarUrlInput}
              size={72}
              label={displayNameInput || user?.email || 'Fan'}
            />
            <Text variant="small" color="secondary" style={styles.avatarHint}>
              Tryk for at uploade
            </Text>
          </Pressable>
          <Button
            title={uploadingAvatar ? 'Uploader...' : 'Upload'}
            onPress={handleUploadAvatar}
            disabled={uploadingAvatar}
            variant="outline"
          />
        </View>
      </Card>

      <View style={styles.footer}>
        <Button title={saving ? 'Gemmer...' : 'Fortsæt'} onPress={handleContinue} disabled={!canContinue} fullWidth />
      </View>
    </Screen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    header: {
      gap: theme.spacing[2],
      marginBottom: theme.spacing[4],
    },
    card: {
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    label: {
      marginTop: theme.spacing[2],
    },
    input: {
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      padding: theme.spacing[3],
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.bg.card,
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    avatarButton: {
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    avatarHint: {
      textAlign: 'center',
    },
    footer: {
      marginTop: theme.spacing[5],
    },
  });
