import React from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <LinearGradient
      colors={["#B0122A", "#E34A2B", "#B0122A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.bg}
    >
      <StatusBar style="light" />

      <View pointerEvents="none" style={styles.band1} />
      <View pointerEvents="none" style={styles.band2} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Image
            source={require("../../assets/fcn-fans-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Velkommen FCN Fans!</Text>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryBtnText}>Kom i gang</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.secondaryLink}>Se som gæst</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 230, height: 230, marginBottom: 8 },
  title: { color: "white", fontSize: 22, fontWeight: "800", marginBottom: 18 },
  primaryBtn: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#F2C14E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { color: "#2B1B00", fontWeight: "800", fontSize: 16 },
  secondaryLink: {
    color: "white",
    opacity: 0.9,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textDecorationLine: "underline",
  },
  band1: {
    position: "absolute",
    width: "140%",
    height: 140,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: 180,
    left: -80,
    transform: [{ rotate: "-18deg" }],
  },
  band2: {
    position: "absolute",
    width: "140%",
    height: 110,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: 320,
    left: -120,
    transform: [{ rotate: "-18deg" }],
  },
});
