import React from 'react';
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Velkommen til appen</Text>
      <Text style={{ marginTop: 8 }}>Dette er en placeholder for Home.</Text>
    </View>
  );
}
