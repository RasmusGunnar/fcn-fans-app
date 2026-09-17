import React from 'react';
import { Text } from 'react-native';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
export function Ionicons({ name, size, color }) {
  return (
    <Text aria-hidden style={{ fontFamily: 'Ionicons', fontSize: size, color }}>
      {String.fromCodePoint(glyphs[name])}
    </Text>
  );
}
export const supabase = {
  storage: {
    from() {
      throw Error('Unexpected network access in render fixture');
    },
  },
};
