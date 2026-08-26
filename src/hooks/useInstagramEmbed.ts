import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInstagramEmbed } from '../services/instagramEmbedApi';
import type { InstagramEmbedReady } from '../types/instagramEmbed';
import type { SharedLinkAttachment } from '../types/externalShare';

export type InstagramEmbedRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; embed: InstagramEmbedReady }
  | { status: 'unavailable'; reason: 'private_or_unavailable' | 'temporarily_unavailable' }
  | { status: 'error' };

type ScopedInstagramEmbedRequestState = {
  canonicalUrl: string;
  value: InstagramEmbedRequestState;
};

type CompletedInstagramEmbedRequest = {
  canonicalUrl: string;
  attempt: number;
  expiresAtMs: number;
};

export function useInstagramEmbed(
  attachment: SharedLinkAttachment,
  enabled = true,
): InstagramEmbedRequestState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const canonicalUrl = attachment.canonicalUrl;
  const [scopedState, setScopedState] = useState<ScopedInstagramEmbedRequestState>(() => ({
    canonicalUrl,
    value: enabled ? { status: 'loading' } : { status: 'idle' },
  }));
  const previousCanonicalUrlRef = useRef(canonicalUrl);
  const completedRequestRef = useRef<CompletedInstagramEmbedRequest | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const canonicalUrlChanged = previousCanonicalUrlRef.current !== canonicalUrl;
    previousCanonicalUrlRef.current = canonicalUrl;
    if (canonicalUrlChanged) completedRequestRef.current = null;
    const completedRequest = completedRequestRef.current;
    const canReuseCompletedRequest =
      completedRequest?.canonicalUrl === canonicalUrl &&
      completedRequest.attempt === attempt &&
      completedRequest.expiresAtMs > Date.now();

    if (!enabled) {
      if (canonicalUrlChanged || !canReuseCompletedRequest) {
        setScopedState({ canonicalUrl, value: { status: 'idle' } });
      }
      return;
    }
    if (canReuseCompletedRequest) return;

    let cancelled = false;
    setScopedState({ canonicalUrl, value: { status: 'loading' } });
    void fetchInstagramEmbed({ canonicalUrl })
      .then((response) => {
        if (cancelled) return;
        completedRequestRef.current =
          response.status === 'ready'
            ? { canonicalUrl, attempt, expiresAtMs: Date.parse(response.expiresAt) }
            : null;
        setScopedState({
          canonicalUrl,
          value:
            response.status === 'ready'
              ? { status: 'ready', embed: response }
              : { status: 'unavailable', reason: response.reason },
        });
      })
      .catch(() => {
        if (!cancelled) {
          completedRequestRef.current = null;
          setScopedState({ canonicalUrl, value: { status: 'error' } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, canonicalUrl, enabled]);

  const state =
    scopedState.canonicalUrl === canonicalUrl
      ? scopedState.value
      : enabled
        ? ({ status: 'loading' } as const)
        : ({ status: 'idle' } as const);

  return { ...state, retry };
}
