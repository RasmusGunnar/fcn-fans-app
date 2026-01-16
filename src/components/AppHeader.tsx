import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

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
            <Image
              source={logoSource || defaultLogo}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {showProfileButton && (
          <Pressable style={styles.profileButton} onPress={handleProfilePress}>
            <Ionicons name="person-outline" size={20} color={colors.card} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: colors.fcnRed,
    overflow: 'visible' as const,
  },
  innerContainer: {
    minHeight: 90,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    width: 78,
    height: 78,
    marginRight: spacing.xs,
    overflow: 'visible' as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 78,
    height: 78,
  },
  textContainer: {
    flex: 1,
    marginLeft: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.card,
  },
  subtitle: {
    fontSize: 12,
    color: colors.card,
    opacity: 0.9,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.fcnRedDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
});