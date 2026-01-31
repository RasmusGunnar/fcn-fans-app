import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultTheme } from '../../theme';

interface ListRowIconProps {
  icon: string;
  title: string;
  subtitle?: string;
}

export function ListRowIcon({ icon, title, subtitle }: ListRowIconProps) {
  const theme = defaultTheme;
  const styles = createStyles(theme);

  return (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon as any} size={20} color={theme.colors.text.secondary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function createStyles(theme: typeof defaultTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[2],
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing[2],
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      color: theme.colors.text.primary,
      fontWeight: '500',
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      marginTop: theme.spacing[0],
    },
  });
}
