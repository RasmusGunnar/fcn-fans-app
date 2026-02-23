import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { AppHeader } from '../components/AppHeader';
import { SongsView } from '../components/views/SongsView';
import { defaultTheme } from '../theme';

const theme = defaultTheme;

/**
 * SongsScreen: Thin wrapper for standalone Songs tab access.
 * Contains AppHeader + SongsView (the actual content).
 * Note: Usually accessed via LibraryStack -> LibraryScreen tabs, but kept here for direct tab backward compat.
 */
export default function SongsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + theme.spacing[6] }}
    >
      <AppHeader
        title="Sangbog"
        subtitle="Alle vores fansange"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <SongsView />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
});
