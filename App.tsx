import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./src/firebase";

import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CommunitiesScreen } from "./src/screens/CommunitiesScreen";
import { CommunityHubScreen } from "./src/screens/CommunityHubScreen";
import { MatchdayScreen } from "./src/screens/MatchdayScreen";
import { CreateCommunityScreen } from "./src/screens/CreateCommunityScreen";
import { CreateEventScreen } from "./src/screens/CreateEventScreen";
import { EventScreen } from "./src/screens/EventScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Main: undefined;
  CommunityHub: { communityId: string };
  CreateCommunity: undefined;
  CreateEvent: { communityId?: string; matchId?: string };
  Event: { eventId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Hjem" component={HomeScreen} />
      <Tab.Screen name="Fællesskaber" component={CommunitiesScreen} />
      <Tab.Screen name="Kampdag" component={MatchdayScreen} />
      <Tab.Screen name="Indbakke" component={InboxScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!user ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log ind" }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="CommunityHub" component={CommunityHubScreen} options={{ title: "Fællesskab" }} />
            <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} options={{ title: "Opret fællesskab" }} />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: "Opret event" }} />
            <Stack.Screen name="Event" component={EventScreen} options={{ title: "Event" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
