import React from 'react';
import { Text, View } from 'react-native';
export const useNavigation = () => ({ navigate() {} });
export const Ionicons = ({ name }) => (
  <span aria-hidden="true">
    {name?.includes('heart') ? '♡' : name?.includes('chat') ? '♧' : '↗'}
  </span>
);
export const MaterialCommunityIcons = Ionicons;
export const logger = { log() {}, warn() {}, error() {} };
export const InlineComments = ({ targetType, targetId }) => (
  <View>
    <Text>Eksisterende samtale</Text>
    <Text>
      {targetType}:{targetId}
    </Text>
  </View>
);
export const supabase = {
  rpc: async (name) => ({ data: name === 'resolve_content_story_targets' ? {} : [], error: null }),
  auth: { getUser: async () => ({ data: { user: null } }) },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  from(table) {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolve) {
        return Promise.resolve({
          data: table === 'news_items' ? window.__newsRows : [],
          error: null,
        }).then(resolve);
      },
    };
    return q;
  },
};

export const OptionsMenu = () => null;
