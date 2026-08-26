import { getPublicUrl } from '../lib/storageUrl';
import {
  getMediaKind,
  getPrimaryMediaKind,
  isVideoMedia,
  normalizeMedia,
  resolveFeedImageAspectRatio,
  resolveFeedVideoAspectRatio,
  resolveMediaUrlWith,
  resolveRenderableMediaWith,
  resolveVideoThumbnailUrlWith,
  type MediaItem,
  type ResolvedMediaItem,
} from './postMediaMapping';
import { resolveDemoMediaAssetUri } from '../demo/mediaAssets';

export {
  getMediaKind,
  getPrimaryMediaKind,
  isVideoMedia,
  normalizeMedia,
  resolveFeedImageAspectRatio,
  resolveFeedVideoAspectRatio,
  type MediaItem,
  type ResolvedMediaItem,
};

/**
 * Resolve a media item to a usable image/video URL.
 * Now uses bucket + path with getPublicUrl helper.
 *
 * Priority: bucket+path → url → publicUrl (legacy)
 *
 * @param media - MediaItem to resolve
 * @returns Resolved URL string, or null if no usable URL found
 */
export function resolveMediaUrl(media: MediaItem | undefined): string | null {
  const resolved = resolveMediaUrlWith(media, getPublicUrl);
  return resolveDemoMediaAssetUri(resolved) ?? resolved;
}

export function resolveRenderableMedia(media: unknown): ResolvedMediaItem[] {
  return resolveRenderableMediaWith(media, getPublicUrl);
}

export function resolveVideoThumbnailUrl(media: MediaItem | undefined): string | null {
  const resolved = resolveVideoThumbnailUrlWith(media, getPublicUrl);
  return resolveDemoMediaAssetUri(resolved) ?? resolved;
}

/**
 * Check if a media item has a resolvable URL.
 */
export function hasResolvableUrl(media: MediaItem | undefined): boolean {
  return !!resolveMediaUrl(media);
}
