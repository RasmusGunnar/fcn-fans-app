// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React, { useEffect, useState } from 'react';
import {
  Pressable,
  View,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/ui';
import { useTheme } from '../theme';
import { useAuth } from '../auth/AuthProvider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ route, navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>(route.params?.mode ?? 'login');
  const [focusedInput, setFocusedInput] = useState<'email' | 'password' | null>(null);
  const appLogo = require('../../assets/NewLogo.png');
  const screenHeight = Dimensions.get('window').height;
  const isCompactHeight = screenHeight < 780;
  const useScrollFallback = screenHeight < 760;
  const { signInWithPassword, signUp, signInWithApple, signInWithFacebook, loading } = useAuth();
  const theme = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    const newMode = route.params?.mode ?? 'login';
    setMode(newMode);
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
        const result = await signUp(e, password);

        if (result?.user) {
          setMode('login');
          setPassword('');
          Alert.alert(
            'Tjek din mail',
            'Vi har sendt dig en mail for at bekræfte din konto. Når du har bekræftet, skal du vende tilbage til appen og logge ind.',
          );
          return;
        }

        return;
      }

      await signInWithPassword(e, password);
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

  const onFacebook = async () => {
    try {
      await signInWithFacebook();
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Ukendt fejl';
      Alert.alert('Fejl', msg);
    }
  };

  const primaryDisabled =
    loading || !email.trim().includes('@') || !password || password.length < 6;
  const isFormValid = email.trim().includes('@') && !!password && password.length >= 6;
  const isSignup = mode === 'signup';

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

  const contentBody = (
    <View style={styles.content}>
      <View style={styles.topNav}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      </View>

      <View style={styles.heroSection}>
        <View style={styles.logoSurface}>
          <Image source={appLogo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text variant="h1" style={styles.heroTitle}>
          {isSignup ? 'Bliv en del af fællesskabet' : 'Velkommen tilbage'}
        </Text>
        <Text variant="body" color="secondary" style={styles.heroSubtitle}>
          {isSignup
            ? 'Opret din profil og kom tættere på andre FCN-fans.'
            : 'Log ind og fortsæt i fællesskabet.'}
        </Text>

        <View style={styles.modeTabs}>
          <Pressable onPress={() => setMode('signup')}>
            <Text style={isSignup ? styles.activeTab : styles.inactiveTab}>Opret profil</Text>
          </Pressable>

          <Pressable onPress={() => setMode('login')}>
            <Text style={!isSignup ? styles.activeTab : styles.inactiveTab}>Log ind</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.authSection}>
        {Platform.OS === 'ios' ? (
          <View style={styles.socialAuthSection}>
            <Pressable
              style={({ pressed }) => [
                styles.appleButton,
                loading && styles.buttonDisabled,
                pressed && !loading && styles.buttonPressed,
              ]}
              onPress={onApple}
              disabled={loading}
            >
              <Text style={styles.appleButtonText}>Fortsæt med Apple</Text>
            </Pressable>
            {!isCompactHeight ? (
              <Text style={styles.helperText}>Hurtigt og sikkert på iPhone</Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.socialAuthSection,
            Platform.OS === 'ios' && styles.secondarySocialAuthSection,
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.facebookButton,
              loading && styles.buttonDisabled,
              pressed && !loading && styles.buttonPressed,
            ]}
            onPress={onFacebook}
            disabled={loading}
          >
            <Text style={styles.facebookButtonText}>FortsÃ¦t med Facebook</Text>
          </Pressable>
        </View>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text variant="small" color="secondary">
            eller fortsæt med email
          </Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.inputGroup}>
          <Text variant="bodyBold" color="secondary" style={styles.inputLabel}>
            Email
          </Text>
          <TextInput
            style={[
              styles.input,
              focusedInput === 'email' && { borderColor: theme.colors.primary },
            ]}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedInput('email')}
            onBlur={() => setFocusedInput(null)}
            placeholder="navn@mail.dk"
            placeholderTextColor={theme.colors.text.secondary}
            keyboardType="email-address"
          />
        </View>

        <View style={[styles.inputGroup, styles.lastInputGroup]}>
          <Text variant="bodyBold" color="secondary" style={styles.inputLabel}>
            Kodeord
          </Text>
          <TextInput
            style={[
              styles.input,
              focusedInput === 'password' && { borderColor: theme.colors.primary },
            ]}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedInput('password')}
            onBlur={() => setFocusedInput(null)}
            placeholder="Min. 6 tegn"
            placeholderTextColor={theme.colors.text.secondary}
          />
        </View>

        <View style={styles.primaryActionSection}>
          <Pressable
            style={({ pressed }) => [
              isFormValid ? styles.primaryButton : styles.primaryButtonDisabled,
              loading && styles.buttonDisabled,
              pressed && !primaryDisabled && styles.primaryButtonPressed,
            ]}
            onPress={onSubmit}
            disabled={primaryDisabled}
          >
            <Text style={isFormValid ? styles.primaryButtonText : styles.primaryButtonTextDisabled}>
              {loading
                ? isSignup
                  ? 'Opretter...'
                  : 'Logger ind...'
                : isSignup
                  ? 'Opret profil'
                  : 'Log ind'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.legalTextContainer}>
          <Text variant="caption" style={styles.legalText}>
            Ved at fortsætte accepterer du vores betingelser.
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.backgroundLayer} pointerEvents="none">
        <LinearGradient
          colors={[theme.colors.bg.canvas, theme.colors.bg.default]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {useScrollFallback ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {contentBody}
          </ScrollView>
        ) : (
          contentBody
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    root: {
      flex: 1,
      backgroundColor: theme.colors.bg.canvas,
    },
    backgroundLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[1],
      paddingBottom: theme.spacing[3],
      justifyContent: 'flex-start',
    },
    scrollContent: {
      flexGrow: 1,
    },
    topNav: {
      minHeight: 40,
      justifyContent: 'center',
      marginBottom: theme.spacing[0],
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    backArrow: {
      fontSize: 24,
      color: theme.colors.text.primary,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: theme.spacing[2],
    },
    logoSurface: {
      width: theme.spacing[14],
      height: theme.spacing[14],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.subtle,
      marginBottom: theme.spacing[2],
    },
    logo: {
      width: 72,
      height: 72,
      alignSelf: 'center',
    },
    heroTitle: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      textAlign: 'center',
      color: theme.colors.text.primary,
    },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      color: theme.colors.text.secondary,
      marginTop: theme.spacing[1],
    },
    modeTabs: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.spacing[6],
      marginTop: theme.spacing[3],
    },
    activeTab: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text.primary,
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.primary,
      paddingBottom: theme.spacing[2],
    },
    inactiveTab: {
      fontSize: 16,
      color: theme.colors.text.secondary,
      paddingBottom: theme.spacing[2],
    },
    authSection: {
      flexShrink: 1,
    },
    socialAuthSection: {
      marginTop: theme.spacing[3],
    },
    secondarySocialAuthSection: {
      marginTop: theme.spacing[2],
    },
    appleButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    facebookButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    appleButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    facebookButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text.inverse,
    },
    helperText: {
      fontSize: 14,
      lineHeight: 18,
      textAlign: 'center',
      color: theme.colors.text.secondary,
      marginTop: theme.spacing[2],
    },
    dividerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: theme.spacing[2],
      marginBottom: theme.spacing[3],
      gap: theme.spacing[2],
    },
    dividerLine: {
      flex: 1,
      height: theme.layout.borderWidth,
      backgroundColor: theme.colors.border.subtle,
    },
    inputGroup: {
      marginBottom: theme.spacing[3],
    },
    lastInputGroup: {
      marginBottom: theme.spacing[0],
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    input: {
      width: '100%',
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.surface,
      color: theme.colors.text.primary,
    },
    primaryActionSection: {
      marginTop: theme.spacing[2],
    },
    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryButtonDisabled: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[3],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text.inverse,
    },
    primaryButtonTextDisabled: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    primaryButtonPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    legalTextContainer: {
      alignItems: 'center',
      marginTop: theme.spacing[2],
      paddingHorizontal: theme.spacing[4],
    },
    legalText: {
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      color: theme.colors.text.secondary,
      paddingHorizontal: theme.spacing[4],
    },
  });
