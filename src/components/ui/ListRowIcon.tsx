import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

interface ListRowIconProps {
  icon: string;
  title: string;
  subtitle?: string;
}

export function ListRowIcon({ icon, title, subtitle }: ListRowIconProps) {
  return (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon as any} size={20} color={colors.subtext} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 2,
  },
});