// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AuthStackParamList } from '../navigation/AuthStack';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const appLogo = require('../../assets/NewLogo.png');
  const heroImage = require('../../assets/stadium-hero.png');

  return (
    <ImageBackground source={heroImage} style={styles.background} resizeMode="cover">
      <LinearGradient
        colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.34)', 'rgba(0,0,0,0.72)']}
        locations={[0, 0.58, 1]}
        style={styles.overlay}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.spacerTop} />

          <View style={styles.heroContent}>
            <Image source={appLogo} style={styles.logo} resizeMode="contain" />

            <View style={styles.textBlock}>
              <RNText style={styles.headline}>Fællesskabet lever her</RNText>
              <RNText style={styles.subtitle}>
                Del oplevelser, følg kampene og mød andre FCN-fans tæt på dig.
              </RNText>
            </View>
          </View>

          <View style={styles.bottomActions}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate('Login', { mode: 'signup' })}
            >
              <RNText style={styles.primaryButtonText}>Kom i gang</RNText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate('Login', { mode: 'login' })}
            >
              <RNText style={styles.secondaryButtonText}>Jeg har allerede en profil</RNText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    background: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: theme.spacing[6],
    },
    spacerTop: {
      flex: 2,
    },
    heroContent: {
      flex: 3,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: theme.spacing[8],
    },
    logo: {
      width: 260,
      height: 260,
      marginBottom: 40,
    },
    textBlock: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
    },
    headline: {
      color: '#FFFFFF',
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: theme.spacing[3],
    },
    subtitle: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 18,
      lineHeight: 28,
      textAlign: 'center',
    },
    bottomActions: {
      paddingBottom: theme.spacing[6],
      gap: theme.spacing[4],
    },
    primaryButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[4],
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 19,
      lineHeight: 24,
      fontWeight: '700',
    },
    secondaryButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[2],
    },
    secondaryButtonText: {
      color: 'rgba(255,255,255,0.96)',
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    pressed: {
      opacity: 0.85,
    },
  });