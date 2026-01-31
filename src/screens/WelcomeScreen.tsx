// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React, { useMemo, useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { Screen, Text, Button, Divider } from '../components/ui';
import { useTheme } from '../theme';

let AppleAuthentication: any = null;
if (Platform.OS === 'ios') {
  AppleAuthentication = require('expo-apple-authentication');
}

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme();

  const canSend = useMemo(() => email.trim().includes('@') && !busy, [email, busy]);

  const sendCode = async () => {
    try {
      setBusy(true);
      const cleanEmail = email.trim().toLowerCase();

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
      });
      if (error) throw error;

      Alert.alert('Kode sendt', 'OTP-flow er fjernet fra hoved-login. Skiftet til email+password.');
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Kunne ikke sende kode');
    } finally {
      setBusy(false);
    }
  };

  const signInWithApple = async () => {
    try {
      if (Platform.OS !== 'ios') {
        Alert.alert('Apple login', 'Apple login virker kun på iOS.');
        return;
      }

      setBusy(true);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple returnerede ingen identityToken');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      // RootNavigator skifter automatisk til AppTabs når session er sat
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Apple login fejlede');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scrollable>
      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="h1">Velkommen</Text>
        <Text variant="body" color="secondary">Log ind for at se feed og favoritter.</Text>

        {/* Email */}
        <Text variant="bodyBold" style={{ marginTop: theme.spacing[2] }}>Mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="din@email.dk"
          style={{
            borderWidth: theme.layout.borderWidth,
            borderColor: theme.colors.border.default,
            padding: theme.spacing[3],
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.bg.card,
            fontSize: theme.typography.body.fontSize,
          }}
        />
        <Button title={busy ? 'Sender...' : 'Send kode'} onPress={sendCode} disabled={!canSend} />

        {/* Separator */}
        <Divider spacing="md" />

        <Text variant="bodyBold">Er du ikke oprettet endnu?</Text>
        <Text variant="body" color="secondary">Så opret dig med (det er samme flow – du får en kode):</Text>

        {/* Social options */}
        {Platform.OS === 'ios' ? (
          <Button
            title={busy ? '...' : 'Fortsæt med Apple'}
            onPress={signInWithApple}
            disabled={busy}
          />
        ) : (
          <Button
            title="Apple (kun iOS)"
            onPress={() => Alert.alert('Info', 'Apple login virker kun på iOS.')}
          />
        )}

        <Button
          title="Fortsæt med Facebook (kommer snart)"
          onPress={() => Alert.alert('Kommer snart', 'Facebook login kommer efter MVP.')}
          disabled={busy}
        />

        <Button title="Fortsæt med Mail (send kode)" onPress={sendCode} disabled={!canSend} />
      </View>
    </Screen>
  );
}
