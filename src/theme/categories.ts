export type CategoryKey = 'post' | 'news' | 'event' | 'bus_trip' | 'match' | 'community' | string;

export type CategoryDefinition = {
  key: CategoryKey;
  label: string;
  colorToken: string;
  iconName: string;
};

export const CATEGORIES: Record<string, CategoryDefinition> = {
  post: {
    key: 'post',
    label: 'Fra Fans',
    colorToken: 'brand.accent',
    iconName: 'chatbubble-ellipses',
  },
  news: {
    key: 'news',
    label: 'Nyhed',
    colorToken: 'brand.accent',
    iconName: 'newspaper',
  },
  event: {
    key: 'event',
    label: 'Event',
    colorToken: 'state.success',
    iconName: 'calendar',
  },
  bus_trip: {
    key: 'bus_trip',
    label: 'Bustur',
    colorToken: 'state.warning',
    iconName: 'bus',
  },
  match: {
    key: 'match',
    label: 'Kamp',
    colorToken: 'state.success',
    iconName: 'football',
  },
  community: {
    key: 'community',
    label: 'Fællesskab',
    colorToken: 'brand.accent',
    iconName: 'people',
  },
};
