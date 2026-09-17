import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { Text } from '../ui';
import { defaultTheme as theme } from '../../theme';
export function ContentDiscoveryEntry() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Åbn stories, FCN Radar og podcasts"
      style={styles.entry}
      onPress={() => navigation.navigate('ContentDiscovery')}
    >
      <Text variant="bodyBold" color="primary">
        Stories · FCN Radar · Podcasts →
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  entry: {
    minHeight: theme.spacing[11],
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
});
