export type MediaItem = {
  demoVideoPreview?: boolean;
  bucket?: string;
  path?: string;
  thumbnail_bucket?: string;
  thumbnail_path?: string;
  thumbnailBucket?: string;
  thumbnailPath?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  url?: string;
  publicUrl?: string;
  type?: 'image' | 'video';
  width?: number;
  height?: number;
  metadata?: {
    width?: number;
    height?: number;
    thumbnail_bucket?: string;
    thumbnail_path?: string;
    thumbnailBucket?: string;
    thumbnailPath?: string;
    thumbnail_url?: string;
    thumbnailUrl?: string;
  };
};

export type ResolvedMediaItem = MediaItem & {
  uri: string;
  type: 'image' | 'video';
};

export const FEED_IMAGE_FALLBACK_ASPECT_RATIO = 1;
export const FEED_VIDEO_FALLBACK_ASPECT_RATIO = 4 / 5;

function readValidDimension(candidate: unknown): number | null {
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : null;
}

function readPersistedDimensions(media: MediaItem | undefined): {
  width: number | null;
  height: number | null;
} {
  const directWidth = readValidDimension(media?.width);
  const directHeight = readValidDimension(media?.height);
  if (directWidth && directHeight) {
    return { width: directWidth, height: directHeight };
  }

  const metadataWidth = readValidDimension(media?.metadata?.width);
  const metadataHeight = readValidDimension(media?.metadata?.height);
  if (metadataWidth && metadataHeight) {
    return { width: metadataWidth, height: metadataHeight };
  }

  return {
    width: null,
    height: null,
  };
}

/**
 * Resolves feed image geometry before the remote image is loaded.
 * Persisted upload dimensions win; legacy items use a deterministic square.
 */
export function resolveFeedImageAspectRatio(media: MediaItem | undefined): number {
  const { width, height } = readPersistedDimensions(media);
  if (!width || !height) return FEED_IMAGE_FALLBACK_ASPECT_RATIO;

  return Math.min(Math.max(width / height, 4 / 5), 1.91);
}

/**
 * Resolves the same bucketed ratio for both a video's poster and native player.
 * Runtime player metadata must not resize an already-painted feed cell.
 */
export function resolveFeedVideoAspectRatio(media: MediaItem | undefined): number {
  const { width, height } = readPersistedDimensions(media);
  if (!width || !height) return FEED_VIDEO_FALLBACK_ASPECT_RATIO;

  const naturalRatio = width / height;
  if (naturalRatio < 0.9) return 4 / 5;
  if (naturalRatio > 1.1) return 16 / 9;
  return 1;
}

export type StoragePublicUrlResolver = (bucket: string, path: string) => string | null;

export function normalizeMedia(media: unknown): MediaItem[] {
  if (!media) {
    return [];
  }

  if (typeof media === 'string') {
    if (media.startsWith('http://') || media.startsWith('https://')) {
      return [{ url: media }];
    }

    try {
      const parsed = JSON.parse(media);
      if (Array.isArray(parsed)) return parsed as MediaItem[];
      if (typeof parsed === 'object' && parsed !== null) return [parsed as MediaItem];
      return [];
    } catch {
      return [];
    }
  }

  if (Array.isArray(media)) {
    return media as MediaItem[];
  }

  if (typeof media === 'object' && media !== null) {
    return [media as MediaItem];
  }

  return [];
}

export function getMediaKind(media: MediaItem | undefined): 'image' | 'video' | null {
  if (!media) return null;

  if (media.type === 'image' || media.type === 'video') {
    return media.type;
  }

  const checkableUrl = media.url || media.publicUrl || media.path || '';
  if (!checkableUrl) return null;

  const lowerUrl = checkableUrl.toLowerCase();
  if (lowerUrl.match(/\.(jpg|jpeg|png|heic|webp)(?:$|[?#])/)) return 'image';
  if (lowerUrl.match(/\.(mp4|mov|m4v|webm|m3u8)(?:$|[?#])/)) return 'video';
  if (lowerUrl.includes('video')) return 'video';
  return null;
}

export function getPrimaryMediaKind(media: unknown): 'image' | 'video' | null {
  return getMediaKind(normalizeMedia(media)[0]);
}

export function isVideoMedia(media: MediaItem | undefined): boolean {
  return getMediaKind(media) === 'video';
}

export function resolveMediaUrlWith(
  media: MediaItem | undefined,
  resolveStoragePublicUrl: StoragePublicUrlResolver,
): string | null {
  if (!media) {
    return null;
  }

  if (media.bucket && media.path) {
    return resolveStoragePublicUrl(media.bucket, media.path);
  }

  if (media.url) {
    return media.url;
  }

  if (media.publicUrl) {
    return media.publicUrl;
  }

  if (media.path) {
    return resolveStoragePublicUrl('post-media', media.path);
  }

  return null;
}

export function resolveVideoThumbnailUrlWith(
  media: MediaItem | undefined,
  resolveStoragePublicUrl: StoragePublicUrlResolver,
): string | null {
  if (!media) {
    return null;
  }

  const directUrl =
    media.thumbnail_url ??
    media.thumbnailUrl ??
    media.metadata?.thumbnail_url ??
    media.metadata?.thumbnailUrl;
  if (directUrl) {
    return directUrl;
  }

  const path =
    media.thumbnail_path ??
    media.thumbnailPath ??
    media.metadata?.thumbnail_path ??
    media.metadata?.thumbnailPath;
  if (!path) {
    return null;
  }

  const bucket =
    media.thumbnail_bucket ??
    media.thumbnailBucket ??
    media.metadata?.thumbnail_bucket ??
    media.metadata?.thumbnailBucket ??
    media.bucket ??
    'post-media';

  return resolveStoragePublicUrl(bucket, path);
}

export function resolveRenderableMediaWith(
  media: unknown,
  resolveStoragePublicUrl: StoragePublicUrlResolver,
): ResolvedMediaItem[] {
  return normalizeMedia(media)
    .map((item) => {
      const uri = resolveMediaUrlWith(item, resolveStoragePublicUrl);
      const type = getMediaKind(item);

      if (!uri || !type) {
        return null;
      }

      return {
        ...item,
        uri,
        type,
      };
    })
    .filter((item): item is ResolvedMediaItem => item !== null);
}
