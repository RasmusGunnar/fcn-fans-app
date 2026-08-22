import { parseInstagramUrl } from '../lib/instagram';

// A reserved HTTPS origin keeps Android's loadDataWithBaseURL document out of
// opaque/null-origin mode without resolving to a real host.
export const INSTAGRAM_EMBED_SHELL_URL = 'https://fcn-fans.invalid/instagram-embed-shell/';

// react-native-webview treats rejected origins as external URLs and calls Linking itself.
// Let every navigation reach the FCN policy below; the policy remains deny-by-default.
export const INSTAGRAM_EMBED_ORIGIN_WHITELIST: string[] = ['*'];

const INSTAGRAM_EMBED_FRAME_PATH = /^\/(?:p|reel)\/[A-Za-z0-9_-]{2,128}\/embed(?:\/captioned)?\/?$/;
const INSTAGRAM_PROFILE_EMBED_FRAME_PATH = /^\/[A-Za-z0-9][A-Za-z0-9._]{0,29}\/embed\/?$/;

export type InstagramEmbedNavigationRequest = {
  url: string;
  isTopFrame?: boolean;
  mainDocumentURL?: string;
  navigationType?: string;
};

export type InstagramEmbedNavigationEvent =
  | ({ kind: 'navigation' } & InstagramEmbedNavigationRequest)
  | { kind: 'open-window'; url: string };

export type InstagramEmbedNavigationDecision = {
  action: 'allow' | 'block';
  reason:
    | 'initial-document'
    | 'embed-subframe'
    | 'main-frame-navigation'
    | 'new-window'
    | 'custom-scheme'
    | 'untrusted-navigation';
};

type InstagramEmbedOpenWindowEvent = {
  nativeEvent: { targetUrl: string };
};

function parseSafeHttpsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizedHostname(parsed: URL): string {
  return parsed.hostname.toLowerCase().replace(/\.$/, '');
}

export function isAllowedInstagramEmbedFrameUrl(rawUrl: string): boolean {
  const parsed = parseSafeHttpsUrl(rawUrl);
  if (!parsed) return false;
  const hostname = normalizedHostname(parsed);
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') return false;
  return (
    INSTAGRAM_EMBED_FRAME_PATH.test(parsed.pathname) ||
    INSTAGRAM_PROFILE_EMBED_FRAME_PATH.test(parsed.pathname)
  );
}

export function getInstagramEmbedNavigationDecision(
  event: InstagramEmbedNavigationEvent,
): InstagramEmbedNavigationDecision {
  if (event.kind === 'open-window') {
    return { action: 'block', reason: 'new-window' };
  }

  if (event.url === INSTAGRAM_EMBED_SHELL_URL) {
    return { action: 'allow', reason: 'initial-document' };
  }

  const parsed = parseSafeHttpsUrl(event.url);
  if (!parsed) {
    return {
      action: 'block',
      reason: /^[A-Za-z][A-Za-z0-9+.-]*:/.test(event.url)
        ? 'custom-scheme'
        : 'untrusted-navigation',
    };
  }

  if (event.isTopFrame === true) {
    return { action: 'block', reason: 'main-frame-navigation' };
  }

  // iOS reports iframe navigations explicitly. RN WebView 13.15.0 does not
  // report Android HTTP(S) iframe loads here, and its top-level direct event can
  // omit frame metadata. Only an explicitly identified iframe may navigate.
  if (event.isTopFrame === false && isAllowedInstagramEmbedFrameUrl(event.url)) {
    return { action: 'allow', reason: 'embed-subframe' };
  }

  return {
    action: 'block',
    reason: event.isTopFrame === false ? 'untrusted-navigation' : 'main-frame-navigation',
  };
}

export function shouldAllowInstagramEmbedNavigation(
  request: InstagramEmbedNavigationRequest,
): boolean {
  return getInstagramEmbedNavigationDecision({ kind: 'navigation', ...request }).action === 'allow';
}

export function shouldRecoverInstagramEmbedMainDocument(url: string): boolean {
  return !shouldAllowInstagramEmbedNavigation({ url, isTopFrame: true });
}

export const instagramEmbedWebViewNavigationHandlers = {
  onShouldStartLoadWithRequest: shouldAllowInstagramEmbedNavigation,
  // In react-native-webview 13.15.0, registering this callback cancels iOS
  // popups and consumes Android child-window URLs without loading them.
  onOpenWindow: ({ nativeEvent }: InstagramEmbedOpenWindowEvent): void => {
    getInstagramEmbedNavigationDecision({ kind: 'open-window', url: nativeEvent.targetUrl });
  },
};

export const INSTAGRAM_EMBED_NAVIGATION_GUARD_SCRIPT = `
(function () {
  if (window.__FCN_INSTAGRAM_NAVIGATION_GUARD__) return true;
  window.__FCN_INSTAGRAM_NAVIGATION_GUARD__ = true;

  window.open = function () { return null; };

  function blockAnchorNavigation(event) {
    var element = event.target;
    while (element && element !== document) {
      if (element.nodeType === 1 && element.tagName === 'A') {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        return false;
      }
      element = element.parentElement;
    }
    return true;
  }

  document.addEventListener('click', blockAnchorNavigation, true);
  document.addEventListener('auxclick', blockAnchorNavigation, true);
  return true;
})();
true;
`;

export type InstagramExternalUrlOpener = (url: string) => Promise<unknown>;

export async function openCanonicalInstagramUrlFromExplicitCta(
  rawUrl: string,
  openUrl: InstagramExternalUrlOpener,
): Promise<boolean> {
  const parsed = parseInstagramUrl(rawUrl);
  if (!parsed) return false;
  await openUrl(parsed.canonicalUrl);
  return true;
}
