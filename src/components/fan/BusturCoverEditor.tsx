import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { pickFanActivityCover, type FanActivityCoverSelection } from '../../lib/fanActivityCover';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { OutlineButton } from '../ui/OutlineButton';
import { FanActivityCover } from './FanActivityCover';
import { getFanActivityVisualPreset } from './fanActivityVisualPresets';

export function BusturCoverEditor({ initialUrl, value, onChange, onBusyChange, disabled }: {
  initialUrl?: string | null;
  value: FanActivityCoverSelection | null | undefined;
  onChange: (selection: FanActivityCoverSelection | null) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const preset = getFanActivityVisualPreset(theme, 'bustur');
  const custom = Boolean(value || (value === undefined && initialUrl));
  const styles = StyleSheet.create({
    section: { gap: theme.spacing[3] },
    image: { height: theme.spacing[16] * 3, borderRadius: theme.radius.lg, overflow: 'hidden' },
  });
  return <View style={styles.section}>
    <Text variant="h3">Busturens coverbillede</Text>
    <FanActivityCover coverUrl={value === undefined ? initialUrl : null}
      source={value ? { uri: value.uri } : preset.source} style={styles.image} resizeMode="cover" accessibilityLabel="Busturens coverbillede" />
    <OutlineButton title={picking ? 'Klargør billede…' : custom ? 'Erstat billede' : 'Vælg eget billede'} disabled={disabled || picking}
      onPress={async () => {
        setPicking(true);
        onBusyChange(true);
        try { const selected = await pickFanActivityCover(); if (selected) onChange(selected); }
        catch (error) { Alert.alert('Billede kunne ikke vælges', error instanceof Error ? error.message : 'Prøv et andet billede.'); }
        finally { setPicking(false); onBusyChange(false); }
      }} />
    {custom ? <OutlineButton title="Fjern eget billede" disabled={disabled || picking} onPress={() => onChange(null)} /> : null}
    <Text variant="caption" color="secondary">Uden eget billede bruges FCN-bussen. Billedændringer gemmes først sammen med aktiviteten. Højst 10 MB.</Text>
  </View>;
}
