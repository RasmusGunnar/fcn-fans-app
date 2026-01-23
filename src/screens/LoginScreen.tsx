import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Pressable,
  TouchableOpacity,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { spacing } from '../theme';
import { useAuth } from '../auth/AuthProvider';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { signInWithPassword, signUp, loading } = useAuth();

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@'))
      return Alert.alert('Ugyldig email', 'Indtast en gyldig emailadresse');
    if (!password || password.length < 6)
      return Alert.alert('Ugyldigt kodeord', 'Kodeord skal være mindst 6 tegn.');

    try {
      if (mode === 'signup') {
        await signUp(e, password);
        Alert.alert('Oprettet', 'Din konto er oprettet. Du kan nu logge ind.');
        setMode('login');
      } else {
        await signInWithPassword(e, password);
      }
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Ukendt fejl';
      Alert.alert('Fejl', msg);
    }
  };

  const onApple = () => Alert.alert('Kommer snart', 'Apple login kommer snart');
  const onFacebook = () => Alert.alert('Kommer snart', 'Facebook login kommer snart');

  let logo: any = null;
  try {
    logo = require('../../assets/fcn-fans-logo.png');
  } catch (e) {
    logo = null;
  }
  let bg: any = null;
  try {
    bg = require('../../assets/login-bg.jpg');
  } catch (e) {
    bg = null;
  }

  const primaryDisabled = loading || !email.trim().includes('@') || password.length < 6;

  return (
    <ImageBackground source={bg ?? undefined} style={styles.bg} resizeMode="cover">
      <View style={styles.bgOverlay} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.wrapper}>
          <View style={styles.card}>
            {logo ? (
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text style={styles.logoFallback}>FCN Fans</Text>
            )}

            <View style={styles.modeToggleRow}>
              <Pressable
                onPress={() => setMode('login')}
                style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                  Log ind
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('signup')}
                style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                  Opret
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sub}>
              {mode === 'login'
                ? 'Log ind for at fortsætte til FCN Fans'
                : 'Opret en konto for at komme i gang'}
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                placeholder="navn@mail.dk"
                placeholderTextColor="#aab3be"
                keyboardType="email-address"
              />

              <Text style={[styles.label, { marginTop: spacing.sm }]}>Kodeord</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 tegn"
                placeholderTextColor="#aab3be"
              />

              <View style={{ height: spacing.md }} />
              <PrimaryButton
                title={
                  loading
                    ? mode === 'signup'
                      ? 'Opretter...'
                      : 'Logger ind...'
                    : mode === 'signup'
                      ? 'Opret'
                      : 'Log ind'
                }
                onPress={onSubmit}
                disabled={primaryDisabled}
              />

              <View style={{ height: spacing.sm }} />
              <View style={styles.signupRow}>
                {mode === 'login' ? (
                  <Text style={styles.infoText}>Er du ikke oprettet endnu? </Text>
                ) : (
                  <Text style={styles.infoText}>Har du allerede en konto? </Text>
                )}
                {mode === 'login' ? (
                  <Pressable onPress={() => setMode('signup')}>
                    <Text style={styles.linkText}>Opret her</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setMode('login')}>
                    <Text style={styles.linkText}>Log ind</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.socialArea}>
              <Text style={styles.socialText}>Du kan også oprette dig med:</Text>

              <View style={styles.socialButtons}>
                <TouchableOpacity style={[styles.socialBtn, styles.disabledBtn]} onPress={onApple}>
                  <Text style={styles.socialBtnText}>Apple</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.socialBtn, styles.disabledBtn]}
                  onPress={onFacebook}
                >
                  <Text style={styles.socialBtnText}>Facebook</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bg: { flex: 1, backgroundColor: '#07101a' },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,12,0.6)' },
  wrapper: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#0b1722',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#12202a',
    shadowColor: '#000',
    shadowOpacity: 0.3,
  },
  logo: { width: 140, height: 70, alignSelf: 'center', marginBottom: 8 },
  logoFallback: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  modeToggleRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  modeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeBtnActive: { backgroundColor: '#123243' },
  modeBtnText: { color: '#9fb4d6', fontWeight: '700' },
  modeBtnTextActive: { color: '#fff' },
  heading: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#9fb4d6', textAlign: 'center', marginBottom: 12 },
  form: { marginTop: 6 },
  label: { color: '#cbd5e1', fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#20323b',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    backgroundColor: 'rgba(6,12,16,0.4)',
  },
  toggle: { color: '#9fb4d6', textAlign: 'center' },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  infoText: { color: '#9fb4d6' },
  linkText: { color: '#cfe7ff', fontWeight: '700', marginLeft: 4 },
  socialArea: { marginTop: 14, alignItems: 'center' },
  socialText: { color: '#9fb4d6', textAlign: 'center', marginBottom: 8 },
  socialButtons: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#233544',
    marginHorizontal: 6,
  },
  disabledBtn: { opacity: 0.6 },
  socialBtnText: { color: '#cbd5e1', fontWeight: '700' },
});
