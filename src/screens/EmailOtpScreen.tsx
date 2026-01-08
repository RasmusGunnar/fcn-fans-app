import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
export default function EmailOtpScreen({ route }: any) {
  const { email } = route.params ?? {};
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

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
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 16 }}>Indtast koden sendt til:</Text>
      <Text style={{ fontSize: 16, fontWeight: '700' }}>{email}</Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Kode"
        keyboardType="number-pad"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <Button title={busy ? 'Tjekker...' : 'Bekræft'} onPress={verify} disabled={busy} />
      <Button title="Send kode igen" onPress={resend} disabled={busy} />
    </View>
  );
}
