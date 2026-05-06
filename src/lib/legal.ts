import { Linking } from 'react-native';

export const SUPPORT_EMAIL = 'support@fcnfans.dk';

const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || 'https://fcnfans.dk/privacy';
const TERMS_OF_USE_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || 'https://fcnfans.dk/terms';

type LegalDocumentKind = 'privacy' | 'terms';

function createSupportMailto(kind: LegalDocumentKind) {
  const subject =
    kind === 'privacy' ? 'Anmodning om privatlivspolitik' : 'Anmodning om brugsvilkår';

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

function createGeneralSupportMailto() {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Support til FCN Fans app')}`;
}

async function openUrl(url: string) {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('Kunne ikke åbne linket.');
  }

  await Linking.openURL(url);
}

export function hasConfiguredLegalUrl(kind: LegalDocumentKind) {
  return Boolean(kind === 'privacy' ? PRIVACY_POLICY_URL : TERMS_OF_USE_URL);
}

export async function openLegalDocument(kind: LegalDocumentKind) {
  const url = kind === 'privacy' ? PRIVACY_POLICY_URL : TERMS_OF_USE_URL;
  const fallbackUrl = createSupportMailto(kind);

  if (url) {
    await openUrl(url);
    return { mode: 'url' as const };
  }

  await openUrl(fallbackUrl);
  return { mode: 'support_fallback' as const };
}

export async function openSupportEmail() {
  await openUrl(createGeneralSupportMailto());
}
