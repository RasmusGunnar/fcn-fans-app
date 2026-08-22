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
