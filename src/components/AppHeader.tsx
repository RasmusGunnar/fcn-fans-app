import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { startNavigationTiming } from '../utils/performanceTiming';
import {
  formatNotificationUnreadBadge,
  getNotificationBellAccessibilityLabel,
} from '../utils/notificationPresentation';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  logoSource?: any;
  showProfileButton?: boolean;
  onPressProfile?: () => void;
  showNotificationButton?: boolean;
  notificationUnreadCount?: number;
  onPressNotifications?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  logoSource,
  showProfileButton = true,
  onPressProfile,
  showNotificationButton = false,
  notificationUnreadCount = 0,
  onPressNotifications,
}: AppHeaderProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const defaultLogo = require('../../assets/NewLogo.png');
  const unreadBadgeLabel = formatNotificationUnreadBadge(notificationUnreadCount);

  const handleProfilePress = () => {
    if (onPressProfile) {
      startNavigationTiming('profile-icon', 'Profile', { headerTitle: title });
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
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        <View style={styles.actions}>
          {showNotificationButton && onPressNotifications ? (
            <Pressable
              style={styles.headerActionButton}
              onPress={onPressNotifications}
              accessibilityRole="button"
              accessibilityLabel={getNotificationBellAccessibilityLabel(notificationUnreadCount)}
              hitSlop={theme.spacing[2]}
            >
              <Ionicons name="notifications-outline" size={20} color={theme.colors.bg.card} />
              {unreadBadgeLabel ? (
                <View style={styles.notificationBadge} pointerEvents="none">
                  <Text style={styles.notificationBadgeText}>{unreadBadgeLabel}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {showProfileButton ? (
            <Pressable
              style={styles.headerActionButton}
              onPress={handleProfilePress}
              accessibilityRole="button"
              accessibilityLabel="Profil"
              hitSlop={theme.spacing[2]}
            >
              <Ionicons name="person-outline" size={20} color={theme.colors.bg.card} />
            </Pressable>
          ) : null}
        </View>
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
      width: theme.spacing[10],
      height: theme.spacing[10],
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
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
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      flexShrink: 0,
    },
    headerActionButton: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      opacity: 0.8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationBadge: {
      position: 'absolute',
      top: -theme.spacing[1],
      right: -theme.spacing[1],
      minWidth: theme.spacing[4],
      height: theme.spacing[4],
      paddingHorizontal: theme.spacing[1],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.bg.card,
      backgroundColor: theme.colors.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationBadgeText: {
      color: theme.colors.bg.card,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
    },
  });
}
