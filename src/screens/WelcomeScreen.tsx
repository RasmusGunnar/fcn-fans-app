import React, { useMemo, useState } from 'react';
import { Alert, Button, Platform, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

let AppleAuthentication: any = null;
if (Platform.OS === 'ios') {
  AppleAuthentication = require('expo-apple-authentication');
}

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

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
    <View style={{ padding: 16, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Velkommen</Text>
      <Text style={{ opacity: 0.8 }}>Log ind for at se feed og favoritter.</Text>

      {/* Email */}
      <Text style={{ marginTop: 10, fontWeight: '600' }}>Mail</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="din@email.dk"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />
      <Button title={busy ? 'Sender...' : 'Send kode'} onPress={sendCode} disabled={!canSend} />

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: '#ddd', marginVertical: 12 }} />

      <Text style={{ fontWeight: '700' }}>Er du ikke oprettet endnu?</Text>
      <Text style={{ opacity: 0.8 }}>Så opret dig med (det er samme flow – du får en kode):</Text>

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
  );
}
