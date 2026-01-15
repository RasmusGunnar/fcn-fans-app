import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const logo = require('../../assets/fcn-fans-logo.png');
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <Image source={logo} style={styles.logo} />
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.fcnRed,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.card,
    fontSize: 14,
    opacity: 0.9,
  },
});