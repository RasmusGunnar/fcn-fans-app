import React, { useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, Image, Alert, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth/AuthProvider";
import { spacing } from "../theme";
import { PrimaryButton } from "../components/PrimaryButton";

export default function WelcomeScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const { signInWithOtp, signInWithApple, loading } = useAuth();

  const onSend = async () => {
    if (!email || !email.includes("@")) return Alert.alert("Ugyldig email", "Indtast en gyldig emailadresse");
    await signInWithOtp(email);
    navigation.navigate("EmailOtp", { email });
  };

  const onApple = async () => {
    Alert.alert("Apple", "Starter Apple login...");
    try {
      await signInWithApple();
    } catch (e) {}
  };

  return (
    <LinearGradient colors={["#B0122A", "#E34A2B", "#B0122A"]} style={styles.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <SafeAreaView style={styles.safe}>
        <View pointerEvents="none" style={styles.band1} />
        <View pointerEvents="none" style={styles.band2} />

        <View style={styles.container}>
          <Image source={require("../../assets/fcn-fans-logo.png")} style={styles.logo} resizeMode="contain" />

          <Text style={styles.title}>Velkommen FCN Fans!</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Din email"
            placeholderTextColor="rgba(255,255,255,0.8)"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />

          <PrimaryButton title={loading ? "Sender..." : "Send kode"} onPress={onSend} />

          <View style={{ height: spacing.sm }} />

          <Pressable style={[styles.socialBtn, styles.apple]} onPress={onApple}>
            <Text style={styles.socialTxt}>Fortsæt med Apple</Text>
          </Pressable>

          <View style={{ height: spacing.sm }} />

          <Pressable onPress={() => navigation.navigate("Login") }>
            <Text style={styles.link}>Log ind med email (eksisterende flow)</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  logo: { width: 220, height: 220, marginBottom: 10 },
  title: { color: "white", fontSize: 22, fontWeight: "800", marginBottom: 18 },
  input: { width: '100%', maxWidth: 360, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, color: 'white' },

  socialBtn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  socialBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
  apple: { backgroundColor: '#000', borderColor: '#000' },
  socialTxt: { color: 'white', fontWeight: '700' },
  link: { color: 'white', textDecorationLine: 'underline', marginTop: 8 },

  primaryBtn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#F2C14E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  primaryBtnText: { color: "#2B1B00", fontWeight: "800", fontSize: 16 },

  secondaryLink: {
    color: "white",
    opacity: 0.9,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    marginTop: 6,
  },
  band1: {
    position: 'absolute',
    width: '140%',
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: 180,
    left: -80,
    transform: [{ rotate: '-18deg' }]
  },
  band2: {
    position: 'absolute',
    width: '140%',
    height: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: 320,
    left: -120,
    transform: [{ rotate: '-18deg' }]
  },
});
