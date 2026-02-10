import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HomeStack } from './HomeStack';
import { CommunitiesStack } from './CommunitiesStack';
import { EventsStack } from './EventsStack';
import SongsScreen from '../screens/SongsScreen';
import { ProfileStack } from './ProfileStack';
import { colors, spacing } from '../theme';
import CreateSheet from '../screens/CreateSheet';

const Tab = createBottomTabNavigator();

const tabData = [
  {
    name: 'Home',
    label: 'Hjem',
    iconActive: 'home' as const,
    iconInactive: 'home-outline' as const,
  },
  {
    name: 'Communities',
    label: 'Fællesskab',
    iconActive: 'people' as const,
    iconInactive: 'people-outline' as const,
  },
  {
    name: 'Events',
    label: 'Events',
    iconActive: 'calendar' as const,
    iconInactive: 'calendar-outline' as const,
  },
  {
    name: 'Songs',
    label: 'Sange',
    iconActive: 'musical-notes' as const,
    iconInactive: 'musical-notes-outline' as const,
  },
];

const onboardingTabData = [
  {
    name: 'Communities',
    label: 'Fællesskab',
    iconActive: 'people' as const,
    iconInactive: 'people-outline' as const,
  },
  {
    name: 'Profile',
    label: 'Profil',
    iconActive: 'person' as const,
    iconInactive: 'person-outline' as const,
  },
];

function CustomTabBar({ state, descriptors, navigation, tabs, showCreate }: any) {
  const insets = useSafeAreaInsets();
  const [sheetVisible, setSheetVisible] = useState(false);

  const onPlusPress = () => {
    console.log('[AppTabs] Plus button pressed - opening CreateSheet');
    setSheetVisible(true);
  };

  const handleCloseSheet = () => {
    console.log('[AppTabs] Closing CreateSheet (setSheetVisible false)');
    setSheetVisible(false);
  };

  const leftTabs = tabs.slice(0, Math.ceil(tabs.length / 2));
  const rightTabs = tabs.slice(Math.ceil(tabs.length / 2));

  const renderTab = (tab: (typeof tabData)[0]) => {
    const route = state.routes.find((r: any) => r.name === tab.name);
    if (!route) return null;
    const { options } = descriptors[route.key];
    const isFocused = state.index === state.routes.indexOf(route);

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

    const iconName = isFocused ? tab.iconActive : tab.iconInactive;

    return (
      <Pressable key={tab.name} onPress={onPress} style={styles.tab}>
        <Ionicons name={iconName} size={20} color={isFocused ? colors.fcnRed : colors.subtext} />
        <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{tab.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabBarContainer, { height: 64 + insets.bottom }]}>
      <View style={styles.tabBar}>
        <View style={styles.sideGroup}>{leftTabs.map(renderTab)}</View>
        {showCreate ? <View style={{ width: 60 }} /> : null}
        <View style={styles.sideGroup}>{rightTabs.map(renderTab)}</View>
        {showCreate ? (
          <Pressable style={styles.centerButton} onPress={onPlusPress}>
            <Text style={styles.plusText}>+</Text>
          </Pressable>
        ) : null}
      </View>
      {showCreate ? <CreateSheet visible={sheetVisible} onClose={handleCloseSheet} /> : null}
    </View>
  );
}

export function AppTabs({ onboardingRequired = false }: { onboardingRequired?: boolean }) {
  const tabs = onboardingRequired ? onboardingTabData : tabData;
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar {...props} tabs={tabs} showCreate={!onboardingRequired} />
      )}
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName={onboardingRequired ? 'Profile' : 'Home'}
    >
      {onboardingRequired ? null : <Tab.Screen name="Home" component={HomeStack} />}
      <Tab.Screen name="Communities" component={CommunitiesStack} />
      {onboardingRequired ? null : <Tab.Screen name="Events" component={EventsStack} />}
      {onboardingRequired ? null : <Tab.Screen name="Songs" component={SongsScreen} />}
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={onboardingRequired ? undefined : { tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    zIndex: 1000,
    elevation: 10,
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    position: 'relative',
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
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
    top: -20,
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
