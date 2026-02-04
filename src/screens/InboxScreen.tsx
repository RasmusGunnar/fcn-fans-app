import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function InboxScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing[4] }]}>
      <Text
        style={[
          styles.h1,
          {
            fontSize: theme.typography.h1.fontSize,
            fontWeight: theme.typography.h1.fontWeight,
            color: theme.colors.text.primary,
          },
        ]}
      >
        Indbakke
      </Text>
      <Text
        style={[styles.muted, { color: theme.colors.text.secondary, marginTop: theme.spacing[2] }]}
      >
        MVP-tip: vis "mine events" + badges for nye beskeder (v2).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  h1: {},
  muted: { opacity: 0.7 },
});
