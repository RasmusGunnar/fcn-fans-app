import { useCallback, useEffect, useState } from 'react';
import { fetchInstagramEmbed } from '../services/instagramEmbedApi';
import type { InstagramEmbedReady } from '../types/instagramEmbed';
import type { SharedLinkAttachment } from '../types/externalShare';

export type InstagramEmbedRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; embed: InstagramEmbedReady }
  | { status: 'unavailable'; reason: 'private_or_unavailable' | 'temporarily_unavailable' }
  | { status: 'error' };

export function useInstagramEmbed(
  attachment: SharedLinkAttachment,
  enabled = true,
): InstagramEmbedRequestState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<InstagramEmbedRequestState>(
    enabled ? { status: 'loading' } : { status: 'idle' },
  );
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void fetchInstagramEmbed(attachment)
      .then((response) => {
        if (cancelled) return;
        setState(
          response.status === 'ready'
            ? { status: 'ready', embed: response }
            : { status: 'unavailable', reason: response.reason },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.canonicalUrl, attachment, attempt, enabled]);

  return { ...state, retry };
}
