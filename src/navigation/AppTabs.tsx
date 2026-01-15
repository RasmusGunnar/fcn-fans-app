import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import CommunitiesScreen from '../screens/CommunitiesScreen';
import EventsScreen from '../screens/EventsScreen';
import SongsScreen from '../screens/SongsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, spacing } from '../theme';

const Tab = createBottomTabNavigator();

const tabData = [
  { name: 'Home', label: 'Hjem', icon: 'home' as const },
  { name: 'Communities', label: 'Fællesskab', icon: 'people' as const },
  { name: 'Events', label: 'Events', icon: 'calendar' as const },
  { name: 'Songs', label: 'Sange', icon: 'musical-notes' as const },
  { name: 'Profile', label: 'Profil', icon: 'person' as const },
];

function CustomTabBar({ state, descriptors, navigation }: any) {
  const onPlusPress = () => {
    navigation.navigate('Create');
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.tabBar}>
        {tabData.map((tab, index) => {
          const route = state.routes.find((r: any) => r.name === tab.name);
          if (!route) return null;
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={tab.name} onPress={onPress} style={styles.tab}>
              <Ionicons name={tab.icon} size={20} color={isFocused ? colors.fcnRed : colors.subtext} />
              <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.centerButton} onPress={onPlusPress}>
          <Text style={styles.plusText}>+</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Communities" component={CommunitiesScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Songs" component={SongsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
    position: 'relative',
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  tabTextActive: {
    color: colors.fcnRed,
  },
  centerButton: {
    position: 'absolute',
    left: '50%',
    top: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -30 }],
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  plusText: {
    fontSize: 24,
    color: colors.card,
    fontWeight: '700',
  },
});
