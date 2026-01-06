import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { PrimaryButton } from "../components/PrimaryButton";
import { spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FCN Fans</Text>
      <Text style={styles.subtitle}>By-fællesskaber • Kampdags-events • Realtime chat</Text>
      <View style={{ height: spacing.xl }} />
      <PrimaryButton title="Kom i gang" onPress={() => navigation.navigate("Login")} />
      <View style={{ height: spacing.sm }} />
      <Text style={styles.hint}>MVP: Email login (til App Store er det nemmest at starte her).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 10 },
  title: { fontSize: 36, fontWeight: "800" },
  subtitle: { fontSize: 16, opacity: 0.75 },
  hint: { fontSize: 12, opacity: 0.6 }
});
