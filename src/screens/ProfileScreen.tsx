import React from 'react';
import { Button, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Profil</Text>
      <Text>{user?.email ?? 'Ingen email'}</Text>
      <Button title="Log ud" onPress={async () => { try { await signOut(); } catch (e) { /* ignore */ } }} />
    </View>
  );
}
