import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';

export default function EmailOtpScreen({ route }: any) {
  const { email } = route.params ?? {};
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme();

  const resend = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      Alert.alert('Sendt igen', 'Tjek din mail (evt. spam).');
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Kunne ikke sende igen');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    try {
      setBusy(true);
      const token = code.replace(/\s/g, '').trim(); // <-- vigtig
      if (token.length < 4) {
        Alert.alert('Fejl', 'Indtast koden fra email.');
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) throw error;
      // RootNavigator skifter automatisk når session er sat
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Koden kunne ikke bekræftes');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: theme.spacing[4], gap: theme.spacing[3] }}>
      <Text style={{ fontSize: theme.typography.body.fontSize }}>Indtast koden sendt til:</Text>
      <Text style={{ fontSize: theme.typography.body.fontSize, fontWeight: '700' }}>{email}</Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Kode"
        keyboardType="number-pad"
        style={{ 
          borderWidth: theme.layout.borderWidth, 
          borderColor: theme.colors.border.default,
          padding: theme.spacing[3], 
          borderRadius: theme.radius.md,
          fontSize: theme.typography.body.fontSize,
          color: theme.colors.text.primary,
          backgroundColor: theme.colors.bg.elevated
        }}
      />

      <Button title={busy ? 'Tjekker...' : 'Bekræft'} onPress={verify} disabled={busy} />
      <Button title="Send kode igen" onPress={resend} disabled={busy} />
    </View>
  );
}
