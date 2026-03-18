import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Screen } from '../components/ui/Screen';
import { useTheme } from '../theme';

export default function LoadingScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Screen style={styles.screen}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    </Screen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg.canvas,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });