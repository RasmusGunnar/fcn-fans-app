import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert } from "react-native";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { PrimaryButton } from "../components/PrimaryButton";
import { spacing } from "../theme";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const submit = async () => {
    try {
      if (!email || !password) return Alert.alert("Udfyld email og kodeord");
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Ukendt fejl");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === "login" ? "Log ind" : "Opret bruger"}</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="navn@mail.dk" />

      <Text style={styles.label}>Kodeord</Text>
      <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />

      <View style={{ height: spacing.md }} />
      <PrimaryButton title={mode === "login" ? "Log ind" : "Opret"} onPress={submit} />

      <View style={{ height: spacing.md }} />
      <Text style={styles.switch} onPress={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Ingen bruger? Opret her" : "Har du en bruger? Log ind"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
  switch: { marginTop: 8, opacity: 0.8, textDecorationLine: "underline" }
});
