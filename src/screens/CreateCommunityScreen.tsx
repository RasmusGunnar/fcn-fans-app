import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { useNavigation } from '@react-navigation/native';

export default function CreateCommunityScreen() {
  const nav = useNavigation();
  const [name, setName] = useState('Ganløse');
  const [municipality, setMunicipality] = useState('Egedal');
  const [description, setDescription] = useState('FCN-fans i Ganløse og omegn');
  const [type, setType] = useState<'city' | 'area'>('city');

  const { user } = useAuth();

  const create = async () => {
    try {
      if (!name.trim()) return Alert.alert('Navn mangler');
      const ref = await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        municipality: municipality.trim(),
        description: description.trim(),
        type,
        memberCount: 1,
        createdBy: user?.id ?? null,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
      });
      // Opret medlemsskab
      await addDoc(collection(db, 'communities', ref.id, 'members'), {
        uid: user?.id ?? null,
        role: 'captain',
        joinedAt: Date.now(),
      });
      // @ts-ignore
      nav.navigate('CommunityHub', { communityId: ref.id });
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Ukendt fejl');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Navn</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Kommune</Text>
      <TextInput style={styles.input} value={municipality} onChangeText={setMunicipality} />

      <Text style={styles.label}>Type (MVP)</Text>
      <TextInput
        style={styles.input}
        value={type}
        onChangeText={(t) => setType(t === 'area' ? 'area' : 'city')}
      />

      <Text style={styles.label}>Beskrivelse</Text>
      <TextInput
        style={[styles.input, { height: 90 }]}
        multiline
        value={description}
        onChangeText={setDescription}
      />

      <View style={{ height: 16 }} />
      <PrimaryButton title="Opret fællesskab" onPress={create} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
