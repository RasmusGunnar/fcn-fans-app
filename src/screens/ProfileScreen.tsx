import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../auth/AuthProvider';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const onLogout = async () => {
    await signOut();
    Alert.alert('Logget ud', 'Du er nu logget ud');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.email}>{user?.email ?? 'Ingen email'}</Text>
      <PrimaryButton title="Log ud" onPress={onLogout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  email: { marginBottom: 20 }
});
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { PrimaryButton } from "../components/PrimaryButton";

export function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Profil</Text>
      <Text style={styles.muted}>{auth.currentUser?.email}</Text>
      <View style={{ height: 16 }} />
      <PrimaryButton title="Log ud" onPress={() => signOut(auth)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 24, fontWeight: "800" },
  muted: { opacity: 0.7, marginTop: 6 }
});
