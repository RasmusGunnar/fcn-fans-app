export const VIDEO_MUTED_BY_DEFAULT = true;

export function toggleVideoMuted(isMuted: boolean): boolean {
  return !isMuted;
}

export function buildInlineVideoPlaybackStatus(shouldPlay: boolean, muted: boolean) {
  return {
    shouldPlay,
    isMuted: muted || !shouldPlay,
    volume: 1,
  };
}

export type FeedVideoLifecycle = {
  mountsPlayer: boolean;
  shouldPlay: boolean;
  isMuted: boolean;
};

/**
 * Keeps player resource ownership separate from the card's fixed geometry.
 * The player remains mounted while the app backgrounds, but is released when
 * the card is no longer the single viewability-selected video.
 */
export function resolveFeedVideoLifecycle(
  isActive: boolean,
  appActive: boolean,
  muted: boolean,
): FeedVideoLifecycle {
  const shouldPlay = isActive && appActive;
  return {
    mountsPlayer: isActive,
    shouldPlay,
    isMuted: muted || !shouldPlay,
  };
}

export type InlineVideoCardLayout = {
  y: number;
  height: number;
};

export function selectActiveInlineVideoKey(
  cardLayouts: Record<string, InlineVideoCardLayout>,
  scrollY: number,
  viewportHeight: number,
  contentOffsetY = 0,
  visibilityThreshold = 0.6,
): string | null {
  if (viewportHeight <= 0) {
    return null;
  }

  const orderedLayouts = Object.entries(cardLayouts).sort(
    ([, left], [, right]) => left.y - right.y,
  );

  for (const [key, layout] of orderedLayouts) {
    if (layout.height <= 0) {
      continue;
    }

    const cardTop = contentOffsetY + layout.y - scrollY;
    const cardBottom = cardTop + layout.height;
    const visibleTop = Math.max(cardTop, 0);
    const visibleBottom = Math.min(cardBottom, viewportHeight);
    const visibleHeight = Math.max(visibleBottom - visibleTop, 0);

    if (visibleHeight / layout.height >= visibilityThreshold) {
      return key;
    }
  }

  return null;
}

export function buildFeedVideoPresentation(
  videoUri: string | null,
  thumbnailUri: string | null,
): {
  canOpen: boolean;
  posterUri: string | null;
  mountsInlinePlayer: boolean;
  autoplay: boolean;
} {
  const hasVideo = Boolean(videoUri);
  return {
    canOpen: hasVideo,
    posterUri: thumbnailUri,
    mountsInlinePlayer: hasVideo,
    autoplay: hasVideo,
  };
}

export function buildMediaViewerParams<T>(
  items: T[],
  requestedIndex: number,
  postId: string,
): { items: T[]; initialIndex: number; postId: string } | null {
  if (items.length === 0) {
    return null;
  }

  return {
    items,
    initialIndex: Math.max(0, Math.min(requestedIndex, items.length - 1)),
    postId,
  };
}
