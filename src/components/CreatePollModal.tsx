import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../theme';

export default function CreatePollModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const handleAddOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const handleOptionChange = (idx: number, value: string) => {
    setOptions(options.map((opt, i) => (i === idx ? value : opt)));
  };

  const handleSubmit = () => {
    // TODO: Implement poll DB integration
    Alert.alert('Kommer snart', 'Poll-funktionalitet er under udvikling');
    onClose();
  };

  if (!visible) return null;

  const styles = makeStyles(theme);

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.title}>Opret Poll</Text>
        <TextInput
          style={styles.input}
          placeholder="Spørgsmål"
          value={question}
          onChangeText={setQuestion}
          placeholderTextColor={theme.colors.text.secondary}
        />
        {options.map((opt, idx) => (
          <TextInput
            key={idx}
            style={styles.input}
            placeholder={`Svarmulighed ${idx + 1}`}
            value={opt}
            onChangeText={(v) => handleOptionChange(idx, v)}
            placeholderTextColor={theme.colors.text.secondary}
          />
        ))}
        {options.length < 6 && (
          <Pressable style={styles.addButton} onPress={handleAddOption}>
            <Text style={styles.addButtonText}>Tilføj svarmulighed</Text>
          </Pressable>
        )}
        <View style={styles.actions}>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Annuller</Text>
          </Pressable>
          <Pressable style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Opret poll</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay.light,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modal: {
    width: '90%',
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  title: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: '700',
    marginBottom: theme.spacing[2],
    color: theme.colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    fontSize: theme.typography.body.fontSize,
    marginBottom: theme.spacing[2],
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.bg.input,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.elevated,
    marginBottom: theme.spacing[2],
  },
  addButtonText: {
    fontSize: theme.typography.small.fontSize,
    color: theme.colors.text.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.elevated,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.text.secondary,
    fontWeight: '600',
    fontSize: theme.typography.body.fontSize,
  },
  submitButton: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  submitButtonText: {
    color: theme.colors.bg.card,
    fontWeight: '600',
    fontSize: theme.typography.body.fontSize,
  },
});
