import { Linking } from 'react-native';
import { openCanonicalInstagramUrlFromExplicitCta } from '../utils/instagramNavigation';

export function openInstagramFromExplicitCta(rawUrl: string): Promise<boolean> {
  return openCanonicalInstagramUrlFromExplicitCta(rawUrl, (canonicalUrl) =>
    Linking.openURL(canonicalUrl),
  );
}
