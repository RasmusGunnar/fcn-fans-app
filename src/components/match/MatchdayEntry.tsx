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
        paddingHorizontal: theme.spacing[3],
        paddingVertical: theme.spacing[2],
        gap: theme.spacing[1] + theme.spacing[1] / 2,
        backgroundColor: '#8E1534',
        borderTopWidth: 1,
        borderTopColor: '#C74362',
      }}
    >
      <Text variant="small" style={{ color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 }}>
        ● KAMPDAG ER ÅBEN
      </Text>
      <Text variant="small" style={{ color: '#FFE3EB' }}>
        Tjek ind, se hvem der er her og deltag i Kampsnak.
      </Text>
      {state.checkInState === 'CHECKED_IN' ? (
        <Text variant="small" accessibilityLiveRegion="polite" style={{ color: '#FFFFFF' }}>
          ✓ Du er tjekket ind
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.entryLabel}
        accessibilityHint="Åbner Kampdag med fans, check-in og Kampsnak."
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
          borderRadius: theme.radius.md,
          backgroundColor: '#FFFFFF',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text variant="bodyBold" style={{ color: '#77112D' }}>
          {state.entryLabel} →
        </Text>
      </Pressable>
    </View>
  );
}
