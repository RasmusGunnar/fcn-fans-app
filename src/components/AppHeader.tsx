import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  logoSource?: any;
  showProfileButton?: boolean;
  onPressProfile?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  logoSource,
  showProfileButton = true,
  onPressProfile,
}: AppHeaderProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const defaultLogo = require('../../assets/NewLogo.png');

  const handleProfilePress = () => {
    if (onPressProfile) {
      onPressProfile();
    } else {
      console.log('TODO: Navigate to profile');
    }
  };

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <View style={styles.innerContainer}>
        {/* Logo and text share vertical center alignment */}
        <View style={styles.contentRow}>
          <View style={styles.logoWrapper}>
            <Image source={logoSource || defaultLogo} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {showProfileButton && (
          <Pressable style={styles.profileButton} onPress={handleProfilePress}>
            <Ionicons name="person-outline" size={20} color={theme.colors.bg.card} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    outerContainer: {
      backgroundColor: theme.colors.primary,
      overflow: 'visible' as const,
    },
    innerContainer: {
      minHeight: theme.spacing[12],
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[2],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'visible' as const,
    },
    contentRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'visible' as const,
    },
    logoWrapper: {
      marginRight: theme.spacing[2],
      overflow: 'visible' as const,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    logo: {
      width: theme.spacing[9],
      height: theme.spacing[9],
    },
    textContainer: {
      flex: 1,
      marginLeft: theme.spacing[0],
    },
    title: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
      color: theme.colors.bg.card,
    },
    subtitle: {
      fontSize: theme.typography.small.fontSize,
      color: theme.colors.bg.card,
      opacity: 0.9,
    },
    profileButton: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      opacity: 0.8,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
