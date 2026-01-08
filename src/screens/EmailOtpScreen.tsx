import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailOtp'> & { route: any };

export default function EmailOtpScreen({ route, navigation }: Props) {
  const { email } = route.params ?? {};
  const [code, setCode] = useState('');
  const { verifyOtp, loading } = useAuth();

  const onVerify = async () => {
    if (!code) return Alert.alert('Udfyld kode', 'Indtast den kode du modtog på email');
    try {
      await verifyOtp(email, code);
      Alert.alert('Velkommen', 'Du er nu logget ind');
      // RootNavigator will switch to AppTabs once session is present
    } catch (e) {
      // verifyOtp already alerts on error
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Indtast kode</Text>
      <Text style={styles.hint}>Vi har sendt en kode til {email}</Text>
      <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" style={styles.input} />
      <PrimaryButton title={loading ? 'Verificerer...' : 'Verificer kode'} onPress={onVerify} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  h1: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  hint: { opacity: 0.8, marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }
});
