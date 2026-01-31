// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React, { useState } from 'react';
import {
  View,
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
import { Text, Card } from '../components/ui';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { signInWithPassword, signUp, loading } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);

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
    <ImageBackground source={bg ?? undefined} style={[styles.bg, { backgroundColor: theme.colors.bg.default }]} resizeMode="cover">
      <View style={[styles.bgOverlay, { backgroundColor: theme.colors.overlay.medium }]} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing[4] }}>
          <Card style={[styles.card, { backgroundColor: theme.colors.bg.card, borderColor: theme.colors.border.default }]}>
            {logo ? (
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text variant="h1" color="inverse" style={{ textAlign: 'center', marginBottom: theme.spacing[2] }}>
                FCN Fans
              </Text>
            )}

            <View style={styles.modeToggleRow}>
              <Pressable
                onPress={() => setMode('login')}
                style={[
                  styles.modeBtn,
                  {
                    paddingVertical: theme.spacing[2],
                    paddingHorizontal: theme.spacing[4],
                    borderRadius: theme.radius.sm,
                    marginHorizontal: theme.spacing[1],
                  },
                  mode === 'login' && [styles.modeBtnActive, { backgroundColor: theme.colors.bg.elevated }],
                ]}
              >
                <Text style={[styles.modeBtnText, { color: theme.colors.text.secondary }, mode === 'login' && [styles.modeBtnTextActive, { color: theme.colors.text.primary }]]}>
                  Log ind
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('signup')}
                style={[
                  styles.modeBtn,
                  {
                    paddingVertical: theme.spacing[2],
                    paddingHorizontal: theme.spacing[4],
                    borderRadius: theme.radius.sm,
                    marginHorizontal: theme.spacing[1],
                  },
                  mode === 'signup' && [styles.modeBtnActive, { backgroundColor: theme.colors.bg.elevated }],
                ]}
              >
                <Text style={[styles.modeBtnText, { color: theme.colors.text.secondary }, mode === 'signup' && [styles.modeBtnTextActive, { color: theme.colors.text.primary }]]}>
                  Opret
                </Text>
              </Pressable>
            </View>

            <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: theme.spacing[3] }}>
              {mode === 'login'
                ? 'Log ind for at fortsætte til FCN Fans'
                : 'Opret en konto for at komme i gang'}
            </Text>

            <View style={{ marginTop: theme.spacing[1] }}>
              <Text variant="bodyBold" color="secondary" style={{ marginBottom: theme.spacing[1] }}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border.default,
                    color: theme.colors.text.primary,
                    backgroundColor: theme.colors.bg.elevated,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing[3],
                    fontSize: theme.typography.body.fontSize,
                  },
                ]}
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                placeholder="navn@mail.dk"
                placeholderTextColor={theme.colors.text.secondary}
                keyboardType="email-address"
              />

              <Text variant="bodyBold" color="secondary" style={{ marginTop: theme.spacing[2], marginBottom: theme.spacing[1] }}>
                Kodeord
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border.default,
                    color: theme.colors.text.primary,
                    backgroundColor: theme.colors.bg.elevated,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing[3],
                    fontSize: theme.typography.body.fontSize,
                  },
                ]}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 tegn"
                placeholderTextColor={theme.colors.text.secondary}
              />

              <View style={{ height: theme.spacing[4] }} />
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

              <View style={{ height: theme.spacing[2] }} />
              <View style={styles.signupRow}>
                {mode === 'login' ? (
                  <Text variant="body" color="secondary">Er du ikke oprettet endnu? </Text>
                ) : (
                  <Text variant="body" color="secondary">Har du allerede en konto? </Text>
                )}
                {mode === 'login' ? (
                  <Pressable onPress={() => setMode('signup')}>
                    <Text style={[styles.linkText, { color: theme.colors.info }]}>Opret her</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setMode('login')}>
                    <Text style={[styles.linkText, { color: theme.colors.info }]}>Log ind</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={{ marginTop: theme.spacing[3], alignItems: 'center' }}>
              <Text variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: theme.spacing[2] }}>
                Du kan også oprette dig med:
              </Text>

              <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    {
                      borderColor: theme.colors.border.default,
                      paddingVertical: theme.spacing[2],
                      paddingHorizontal: theme.spacing[4],
                      borderRadius: theme.radius.sm,
                      marginHorizontal: theme.spacing[1],
                    },
                  ]}
                  onPress={onApple}
                >
                  <Text style={[styles.socialBtnText, { color: theme.colors.text.secondary }]}>Apple</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.socialBtn,
                    {
                      borderColor: theme.colors.border.default,
                      paddingVertical: theme.spacing[2],
                      paddingHorizontal: theme.spacing[4],
                      borderRadius: theme.radius.sm,
                      marginHorizontal: theme.spacing[1],
                    },
                  ]}
                  onPress={onFacebook}
                >
                  <Text style={[styles.socialBtnText, { color: theme.colors.text.secondary }]}>Facebook</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  flex: { flex: 1 },
  bg: { flex: 1 },
  bgOverlay: { ...StyleSheet.absoluteFillObject },
  card: {
    borderWidth: theme.layout.borderWidth,
  },
  logo: { width: 140, height: 68, alignSelf: 'center', marginBottom: theme.spacing[2] },
  modeToggleRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: theme.spacing[2] },
  modeBtn: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeBtnActive: {},
  modeBtnText: { fontWeight: '700' },
  modeBtnTextActive: {},
  input: {
    borderWidth: theme.layout.borderWidth,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: { fontWeight: '700', marginLeft: theme.spacing[1] },
  socialBtn: {
    borderWidth: theme.layout.borderWidth,
    opacity: 0.6,
  },
  socialBtnText: { fontWeight: '700' },
});
