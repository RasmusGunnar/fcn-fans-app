import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui';
import { useTheme } from '../../theme';
import type { matchdayExperience } from '../../utils/matchdayExperience';

// An entry inside the existing Match Center/hero, never a competing match card.
export function MatchdayEntry({
  state,
  onPress,
}: {
  state: ReturnType<typeof matchdayExperience>;
  onPress: () => void;
}) {
  const theme = useTheme();
  if (!state.open) return null;
  return (
    <View
      testID="matchday-entry"
      style={{
        padding: theme.spacing[4],
        gap: theme.spacing[2],
        backgroundColor: theme.colors.pill.red.bg,
      }}
    >
      <Text variant="small" style={{ color: theme.colors.primaryDark, fontWeight: '800' }}>
        ● KAMPDAG ER ÅBEN
      </Text>
      <Text variant="small">Tjek ind, se hvem der er her og deltag i Kampsnak.</Text>
      {state.checkInState === 'CHECKED_IN' ? (
        <Text variant="small" accessibilityLiveRegion="polite">
          ✓ Du er tjekket ind
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.entryLabel}
        accessibilityHint="Åbner Kampdag med fans, check-in og Kampsnak."
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: theme.spacing[12],
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing[3],
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.primaryDark,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text variant="bodyBold" color="inverse">
          {state.entryLabel} →
        </Text>
      </Pressable>
    </View>
  );
}
