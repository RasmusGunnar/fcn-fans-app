import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

interface FeedCardHeaderProps {
  badgeText?: string;
  avatarSlot: ReactNode; // Render prop for avatar (Avatar component or fallback)
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode; // OptionsMenu or other right-aligned content
}

/**
 * Shared header component for feed cards (posts, news, etc.)
 * Ensures consistent layout: badge → avatar → title/subtitle → menu
 */
export function FeedCardHeader({
  avatarSlot,
  title,
  subtitle,
  rightSlot,
}: FeedCardHeaderProps) {
  return (
    <View style={styles.header}>
      {avatarSlot}
      <View style={styles.headerInfo}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  rightSlot: {
    marginLeft: spacing.xs,
  },
});
