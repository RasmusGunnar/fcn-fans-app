// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Text, Card, Button } from '../components/ui';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ route, navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>(route.params?.mode ?? 'login');
  const { signInWithPassword, signUp, signInWithApple, loading } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    if (route.params?.mode) {
      setMode(route.params.mode);
    }
  }, [route.params?.mode]);

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      return Alert.alert('Ugyldig email', 'Indtast en gyldig emailadresse');
    }
    if (!password || password.length < 6) {
      return Alert.alert('Ugyldigt kodeord', 'Kodeord skal være mindst 6 tegn.');
    }
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

  const onApple = async () => {
    try {
      await signInWithApple();
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Ukendt fejl';
      Alert.alert('Fejl', msg);
    }
  };

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

  const primaryDisabled =
    loading || !email.trim().includes('@') || !password || password.length < 6;

  return (
    <ImageBackground
      source={bg ?? undefined}
      style={[styles.bg, { backgroundColor: theme.colors.bg.default }]}
      resizeMode="cover"
    >
      <View style={[styles.bgOverlay, { backgroundColor: theme.colors.overlay.medium }]} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing[4] }}>
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.bg.card, borderColor: theme.colors.border.default },
            ]}
          >
            <Button title="Tilbage" variant="ghost" onPress={() => navigation.goBack()} />

            {logo ? (
              <Image source={logo} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text
                variant="h1"
                color="inverse"
                style={{ textAlign: 'center', marginBottom: theme.spacing[2] }}
              >
                FCN Fans
              </Text>
            )}

            <Text variant="h2" style={{ textAlign: 'center', marginBottom: theme.spacing[2] }}>
              {mode === 'signup' ? 'Opret bruger' : 'Log ind'}
            </Text>

            <Text
              variant="body"
              color="secondary"
              style={{ textAlign: 'center', marginBottom: theme.spacing[3] }}
            >
              {mode === 'login'
                ? 'Log ind for at fortsætte til FCN Fans'
                : 'Opret en konto for at komme i gang'}
            </Text>

            {Platform.OS === 'ios' ? (
              <>
                <PrimaryButton title="Fortsæt med Apple" onPress={onApple} disabled={loading} />
                <Text
                  variant="caption"
                  color="secondary"
                  style={{ textAlign: 'center', marginTop: theme.spacing[1] }}
                >
                  Hurtigst på iPhone
                </Text>
              </>
            ) : null}

            <View style={{ marginTop: theme.spacing[3] }}>
              <Text variant="bodyBold" color="secondary" style={{ marginBottom: theme.spacing[1] }}>
                Email
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
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                placeholder="navn@mail.dk"
                placeholderTextColor={theme.colors.text.secondary}
                keyboardType="email-address"
              />

              <Text
                variant="bodyBold"
                color="secondary"
                style={{ marginTop: theme.spacing[2], marginBottom: theme.spacing[1] }}
              >
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

              <View style={{ height: theme.spacing[3] }} />
              <PrimaryButton
                title={
                  loading
                    ? mode === 'signup'
                      ? 'Opretter...'
                      : 'Logger ind...'
                    : mode === 'signup'
                      ? 'Opret bruger'
                      : 'Log ind'
                }
                onPress={onSubmit}
                disabled={primaryDisabled}
              />
            </View>

            {Platform.OS === 'ios' ? (
              <View style={{ marginTop: theme.spacing[4], alignItems: 'center' }}>
                <Text
                  variant="body"
                  color="secondary"
                  style={{ textAlign: 'center', marginBottom: theme.spacing[2] }}
                >
                  Du kan også fortsætte med:
                </Text>
                <Button title="Facebook" onPress={() => {}} disabled fullWidth variant="outline" />
                <Text variant="caption" color="muted" style={{ marginTop: theme.spacing[1] }}>
                  Kommer snart
                </Text>
              </View>
            ) : null}
          </Card>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    flex: { flex: 1 },
    bg: { flex: 1 },
    bgOverlay: { ...StyleSheet.absoluteFillObject },
    card: {
      borderWidth: theme.layout.borderWidth,
    },
    logo: { width: 140, height: 68, alignSelf: 'center', marginBottom: theme.spacing[2] },
    input: {
      borderWidth: theme.layout.borderWidth,
    },
  });
