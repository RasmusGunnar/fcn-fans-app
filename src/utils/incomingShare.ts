import { extractInstagramShare, parseInstagramUrl } from '../lib/instagram';
import type {
  IncomingExternalShare,
  IncomingShareSource,
  PersistedIncomingShare,
} from '../types/externalShare';

export const INCOMING_SHARE_TTL_MS = 10 * 60 * 1000;

export type NativeIncomingSharePayload = {
  id?: unknown;
  rawText?: unknown;
  canonicalUrl?: unknown;
  resourceType?: unknown;
  receivedAt?: unknown;
  source?: unknown;
};

function readSource(value: unknown): IncomingShareSource {
  if (value === 'ios_share_extension' || value === 'android_share_intent') return value;
  return 'manual';
}

function readReceivedAt(value: unknown, now: number): string {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp) && timestamp <= now + 60_000)
      return new Date(timestamp).toISOString();
  }
  return new Date(now).toISOString();
}

export function normalizeNativeIncomingShare(
  payload: NativeIncomingSharePayload,
  now = Date.now(),
): IncomingExternalShare | null {
  const rawValue =
    typeof payload.canonicalUrl === 'string'
      ? payload.canonicalUrl
      : typeof payload.rawText === 'string'
        ? payload.rawText
        : '';
  const attachment = extractInstagramShare(rawValue);
  if (!attachment) return null;

  const receivedAt = readReceivedAt(payload.receivedAt, now);
  if (now - Date.parse(receivedAt) > INCOMING_SHARE_TTL_MS) return null;

  const id =
    typeof payload.id === 'string' && payload.id.trim().length > 0
      ? payload.id.trim().slice(0, 128)
      : `${attachment.canonicalUrl}:${receivedAt}`;

  return {
    ...attachment,
    id,
    receivedAt,
    source: readSource(payload.source),
  };
}

export function parseNativeIncomingShareJson(
  value: string | null | undefined,
  now = Date.now(),
): IncomingExternalShare | null {
  if (!value || value.length > 8192) return null;
  try {
    return normalizeNativeIncomingShare(JSON.parse(value) as NativeIncomingSharePayload, now);
  } catch {
    return null;
  }
}

export function isIncomingShareExpired(pending: PersistedIncomingShare, now = Date.now()): boolean {
  const receivedAt = Date.parse(pending.share.receivedAt);
  return !Number.isFinite(receivedAt) || now - receivedAt > INCOMING_SHARE_TTL_MS;
}

export function canPresentIncomingShare(
  pending: PersistedIncomingShare,
  currentUserId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (isIncomingShareExpired(pending, now)) return false;
  if (!pending.ownerUserId) return true;
  return pending.ownerUserId === (currentUserId ?? null);
}

export function mergeIncomingShare(
  current: PersistedIncomingShare | null,
  incoming: IncomingExternalShare,
  ownerUserId: string | null,
  now = Date.now(),
): PersistedIncomingShare {
  if (
    current &&
    !isIncomingShareExpired(current, now) &&
    current.share.canonicalUrl === incoming.canonicalUrl &&
    current.ownerUserId === ownerUserId
  ) {
    return current;
  }
  return { share: incoming, ownerUserId };
}

export function parsePersistedIncomingShare(
  value: string | null | undefined,
  now = Date.now(),
): PersistedIncomingShare | null {
  if (!value || value.length > 8192) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const shareRecord = parsed.share;
    const ownerUserId = parsed.ownerUserId;
    if (!shareRecord || typeof shareRecord !== 'object' || Array.isArray(shareRecord)) return null;
    const rawShare = shareRecord as Record<string, unknown>;
    const canonicalUrl = typeof rawShare.canonicalUrl === 'string' ? rawShare.canonicalUrl : '';
    const attachment = parseInstagramUrl(canonicalUrl);
    if (!attachment) return null;
    const normalized = normalizeNativeIncomingShare(
      {
        id: rawShare.id,
        canonicalUrl,
        receivedAt: rawShare.receivedAt,
        source: rawShare.source,
      },
      now,
    );
    if (!normalized) return null;
    const result: PersistedIncomingShare = {
      share: normalized,
      ownerUserId: typeof ownerUserId === 'string' && ownerUserId ? ownerUserId : null,
    };
    return isIncomingShareExpired(result, now) ? null : result;
  } catch {
    return null;
  }
}
