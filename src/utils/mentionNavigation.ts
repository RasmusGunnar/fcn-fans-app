import { navigationRef } from '../navigation/navigationRef';
import type { MentionTarget } from '../services/mentionAutocompleteApi';

type NavigationLike = {
  navigate: (routeName: string, params?: Record<string, unknown>) => void;
  getParent?: () => NavigationLike | undefined;
  getState?: () => { routeNames?: string[] } | undefined;
};

function hasRoute(navigation: NavigationLike | undefined, routeName: string): boolean {
  const routeNames = navigation?.getState?.()?.routeNames;
  return Array.isArray(routeNames) ? routeNames.includes(routeName) : false;
}

export function navigateToMentionTarget(
  navigation: NavigationLike,
  target: MentionTarget,
): boolean {
  if (target.type === 'profile') {
    if (hasRoute(navigation, 'PublicProfile')) {
      navigation.navigate('PublicProfile', { userId: target.id });
      return true;
    }

    if (navigationRef.isReady()) {
      navigationRef.navigate('Main', {
        screen: 'Home',
        params: { screen: 'PublicProfile', params: { userId: target.id } },
      });
      return true;
    }

    return false;
  }

  const params = { id: target.id, title: target.title };
  if (hasRoute(navigation, 'CommunityDetail')) {
    navigation.navigate('CommunityDetail', params);
    return true;
  }

  const parentNavigation = navigation.getParent?.();
  if (parentNavigation && hasRoute(parentNavigation, 'Communities')) {
    parentNavigation.navigate('Communities', {
      screen: 'CommunityDetail',
      params,
    });
    return true;
  }

  if (navigationRef.isReady()) {
    navigationRef.navigate('Main', {
      screen: 'Communities',
      params: { screen: 'CommunityDetail', params },
    });
    return true;
  }

  return false;
}
