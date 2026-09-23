import React from 'react';
import { View, Pressable, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { Avatar } from '../Avatar';
import { Text } from '../ui/Text';
import { defaultTheme as theme } from '../../theme';
import { navigationRef } from '../../navigation/navigationRef';
import { VIBES, type CarpoolPerson } from '../../services/carpoolContract';

export function CarpoolButton({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[cp.button, selected && cp.selected, disabled && cp.disabled]}
    >
      <Text style={cp.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function CarpoolField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={cp.stack}>
      <Text variant="bodyBold">{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.text.secondary}
        style={[cp.input, props.multiline && cp.multiline, props.style]}
      />
    </View>
  );
}
export function CarpoolChoices({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={cp.stack}>
      <Text variant="bodyBold">{label}</Text>
      <View style={cp.row}>
        {options.map(([key, text]) => (
          <CarpoolButton
            key={key}
            label={text}
            selected={key === value}
            disabled={disabled}
            onPress={() => onChange(key)}
          />
        ))}
      </View>
    </View>
  );
}
export function CarpoolVibes({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={cp.stack}>
      <Text variant="bodyBold">Stemning · højst 3</Text>
      <View style={cp.row}>
        {VIBES.map(([key, label]) => (
          <CarpoolButton
            key={key}
            label={label}
            selected={value.includes(key)}
            disabled={disabled || (!value.includes(key) && value.length >= 3)}
            onPress={() =>
              onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])
            }
          />
        ))}
      </View>
    </View>
  );
}
export function CarpoolPersonView({ person }: { person: CarpoolPerson }) {
  return (
    <Pressable
      style={cp.person}
      accessibilityRole="button"
      accessibilityLabel={`Se profil: ${person.name}`}
      onPress={() => navigationRef.navigate('PublicProfile', { userId: person.id })}
    >
      <Avatar
        userId={person.id}
        avatarUrl={person.avatar_url}
        label={person.name}
        size={theme.spacing[10]}
      />
      <View style={cp.personText}>
        <Text variant="bodyBold">{person.name}</Text>
        <Text variant="caption">Se profil{person.fan_level_key ? ' · FCN-fan' : ''}</Text>
      </View>
    </Pressable>
  );
}
export const cp = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg.default },
  content: { padding: theme.spacing[5], gap: theme.spacing[5], paddingBottom: theme.spacing[16] },
  stack: { gap: theme.spacing[2] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  card: {
    padding: theme.layout.cardPadding,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.lg,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
  },
  hero: { backgroundColor: theme.colors.pill.red.bg, borderColor: theme.colors.primary },
  button: {
    minHeight: theme.spacing[12],
    minWidth: theme.spacing[12],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
  },
  buttonText: { ...theme.typography.bodyBold, color: theme.colors.primaryDark },
  selected: { backgroundColor: theme.colors.pill.red.bg, borderColor: theme.colors.primary },
  disabled: { opacity: 0.5 },
  input: {
    minHeight: theme.spacing[12],
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    backgroundColor: theme.colors.bg.card,
    color: theme.colors.text.primary,
    ...theme.typography.body,
  },
  multiline: { minHeight: theme.spacing[16], textAlignVertical: 'top' },
  error: { color: theme.colors.text.error },
  person: {
    minHeight: theme.spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  personText: { flex: 1 },
  avatar: { width: theme.spacing[10], height: theme.spacing[10], borderRadius: theme.radius.pill },
  avatarEmpty: {
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
