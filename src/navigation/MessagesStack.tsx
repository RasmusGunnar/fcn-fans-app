import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import ConversationScreen from '../screens/ConversationScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import MessagesListScreen from '../screens/MessagesListScreen';
import NewMessageScreen from '../screens/NewMessageScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import type { MessagePeer } from '../types/messages';

export type MessagesStackParamList = {
  MessagesList: undefined;
  Conversation: { conversationId: string; peer?: MessagePeer };
  GroupInfo: { conversationId: string };
  NewMessage: undefined;
  PublicProfile: { userId: string };
};

const Stack = createNativeStackNavigator<MessagesStackParamList>();

export function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MessagesList" component={MessagesListScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </Stack.Navigator>
  );
}
