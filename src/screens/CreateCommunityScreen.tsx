import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme } from '../theme';
import { createCommunity } from '../services/communities';

export default function CreateCommunityScreen() {
  const navigation = useNavigation();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Fejl', 'Navn er påkrævet');
      return;
    }

    setCreating(true);

    try {
      const community = await createCommunity(name, description || null);

      if (!community) {
        Alert.alert('Fejl', 'Kunne ikke oprette fællesskab');
        setCreating(false);
        return;
      }

      Alert.alert('Succes', 'Fællesskabet er oprettet!', [
        {
          text: 'OK',
          onPress: () => {
            (navigation as any).navigate('CommunityDetail', {
              id: community.id,
              title: community.name,
            });
          },
        },
      ]);
    } catch (err: any) {
      console.error('[CreateCommunity] Error:', err);
      Alert.alert('Fejl', err.message || 'Kunne ikke oprette fællesskab');
      setCreating(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Opret fællesskab</Text>
        <Text style={styles.subtitle}>Saml lokale fans i dit område</Text>

        <Text style={styles.label}>Navn *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="F.eks. Ganløse, Egedal, eller Nordsjælland"
          placeholderTextColor={theme.colors.text.secondary}
        />

        <Text style={styles.label}>Beskrivelse</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Fortæl om jeres fællesskab..."
          placeholderTextColor={theme.colors.text.secondary}
          multiline
          numberOfLines={4}
        />

        <PrimaryButton
          title={creating ? 'Opretter...' : 'Opret fællesskab'}
          onPress={handleCreate}
          disabled={creating}
        />

        <PrimaryButton
          title="Annuller"
          onPress={() => navigation.goBack()}
          disabled={creating}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  content: {
    padding: theme.spacing[6],
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[8],
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.sm,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
});
