import React from "react";
import { View, Text, StyleSheet } from "react-native";

export function InboxScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Indbakke</Text>
      <Text style={styles.muted}>MVP-tip: vis “mine events” + badges for nye beskeder (v2).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 24, fontWeight: "800" },
  muted: { opacity: 0.7, marginTop: 8 }
});
