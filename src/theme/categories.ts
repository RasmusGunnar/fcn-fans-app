export type CategoryKey =
  | 'post'
  | 'fan'
  | 'news'
  | 'event'
  | 'bus_trip'
  | 'match'
  | 'community'
  | string;

export type CategoryDefinition = {
  key: CategoryKey;
  label: string;
  solidBgToken: string;
  solidTextToken?: string;
  iconName: string;
};

export const CATEGORIES: Record<string, CategoryDefinition> = {
  post: {
    key: 'post',
    label: 'Fra Fans',
    solidBgToken: 'primary',
    solidTextToken: 'text.onSolid',
    iconName: 'chatbubble-ellipses',
  },
  fan: {
    key: 'fan',
    label: 'Fra Fans',
    solidBgToken: 'primary',
    solidTextToken: 'text.onSolid',
    iconName: 'chatbubble-ellipses',
  },
  news: {
    key: 'news',
    label: 'Nyhed',
    solidBgToken: 'state.success',
    solidTextToken: 'text.onSolid',
    iconName: 'newspaper',
  },
  event: {
    key: 'event',
    label: 'Event',
    solidBgToken: 'state.warning',
    solidTextToken: 'text.onSolid',
    iconName: 'calendar',
  },
  bus_trip: {
    key: 'bus_trip',
    label: 'Bustur',
    solidBgToken: 'state.warning',
    solidTextToken: 'text.onSolid',
    iconName: 'bus',
  },
  match: {
    key: 'match',
    label: 'Kamp',
    solidBgToken: 'brand.gold',
    solidTextToken: 'text.onSolid',
    iconName: 'football',
  },
  community: {
    key: 'community',
    label: 'Fællesskab',
    solidBgToken: 'primary',
    solidTextToken: 'text.onSolid',
    iconName: 'people',
  },
};
