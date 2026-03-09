// =====================================================
// DESIGN SYSTEM RULES:
// DO NOT hardcode radius/spacing/colors/shadows; use theme tokens.
// =====================================================

import React from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AuthStack';
import { Text, Button } from '../components/ui';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const appLogo = require('../../assets/NewLogo.png');

  return (
    <ImageBackground
      source={require('../../assets/stadium-hero.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} pointerEvents="none" />
      <LinearGradient
        colors={[theme.colors.background, theme.colors.background, theme.colors.background]}
        style={styles.gradient}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.contentLayer}>
            <View style={styles.topBrand}>
              <Image
                source={appLogo}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.heroContent}>
              <Text variant="h1" style={styles.headline}>
                Fællesskabet lever her
              </Text>
              <Text variant="body" color="secondary" style={styles.subtitle}>
                Del oplevelser, følg kampene og mød andre FCN-fans tæt på dig.
              </Text>
            </View>

            <View style={styles.bottomActions}>
              <Pressable
                style={styles.ctaButton}
                onPress={() => navigation.navigate('Login', { mode: 'signup' })}
              >
                <Text style={styles.ctaText}>Kom i gang</Text>
              </Pressable>
              <View style={styles.secondaryAction}>
                <Button
                  title="Jeg har allerede en profil"
                  variant="ghost"
                  fullWidth
                  onPress={() => navigation.navigate('Login', { mode: 'login' })}
                />
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    background: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.background,
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    container: {
      flex: 1,
      paddingHorizontal: theme.spacing[3],
    },
    contentLayer: {
      flex: 1,
    },
    topBrand: {
      flex: 2,
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingBottom: theme.spacing[4],
    },
    logo: {
      width: 96,
      height: 96,
      alignSelf: 'center',
      marginBottom: theme.spacing[4],
    },
    heroContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[6],
      paddingTop: theme.spacing[8],
    },
    headline: {
      color: theme.colors.card,
      fontSize: 36,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: theme.spacing[3],
    },
    subtitle: {
      color: theme.colors.card,
      textAlign: 'center',
      fontSize: 16,
    },
    bottomActions: {
      paddingHorizontal: theme.spacing[6],
      paddingBottom: theme.spacing[7],
    },
    secondaryAction: {
      marginTop: theme.spacing[3],
      textAlign: 'center',
    },
    ctaButton: {
      width: '100%',
      borderRadius: theme.radius.pill,
      paddingVertical: theme.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    ctaText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.card,
    },
  });
