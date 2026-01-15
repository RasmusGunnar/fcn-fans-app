import React from 'react';
import { Button, Text, View, ScrollView, StyleSheet } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthProvider';
import { colors, spacing } from '../theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg, padding: spacing.md }}
    >
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.email}>{user?.email ?? 'Ingen email'}</Text>
      <Button title="Log ud" onPress={async () => { try { await signOut(); } catch (e) { /* ignore */ } }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  email: {
    fontSize: 16,
    color: colors.subtext,
    marginBottom: spacing.lg,
  },
});
