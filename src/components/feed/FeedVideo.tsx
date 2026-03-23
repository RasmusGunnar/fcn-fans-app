// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';

const theme = defaultTheme;

export type VideoRatio = '16:9' | '4:5' | '1:1';

/**
 * Pick the best Instagram-style bucket for a raw width/height.
 *  - portrait (h > w)  => 4:5
 *  - landscape (w > h) => 16:9
 *  - square / unknown  => 1:1
 */
function pickRatio(w?: number, h?: number): VideoRatio {
  if (!w || !h || w <= 0 || h <= 0) return '4:5'; // fallback = portrait
  const aspect = w / h;
  if (aspect < 0.9) return '4:5'; // portrait
  if (aspect > 1.1) return '16:9'; // landscape
  return '1:1'; // square-ish
}

function ratioToNumber(r: VideoRatio): number {
  switch (r) {
    case '16:9':
      return 16 / 9;
    case '4:5':
      return 4 / 5;
    case '1:1':
      return 1;
  }
}

export interface FeedVideoProps {
  uri: string;
  /** Whether this video should be playing (viewability-driven). */
  isActive: boolean;
  /** Whether the host app is in the foreground. */
  isAppActive: boolean;
  /** Width/height from media metadata, used to pick aspect ratio. */
  naturalWidth?: number;
  naturalHeight?: number;
  /** Called when playback error occurs. */
  onError?: (error: any) => void;
}

/**
 * Instagram-style feed video:
 *  - Autoplay/pause driven by `isActive` + `isAppActive`.
 *  - Autoplay is muted by default; explicit control toggles sound.
 *  - Loops.
 *  - Aspect ratio derived from natural size (or 4:5 fallback).
 */
export function FeedVideo({
  uri,
  isActive,
  isAppActive,
  naturalWidth,
  naturalHeight,
  onError,
}: FeedVideoProps) {
  const videoRef = useRef<Video>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [detectedRatio, setDetectedRatio] = useState<VideoRatio | null>(null);

  // If we have metadata from the post, use it; else wait for onLoad
  const metaRatio = naturalWidth && naturalHeight ? pickRatio(naturalWidth, naturalHeight) : null;

  const finalRatio = metaRatio ?? detectedRatio ?? '4:5';

  // Play or pause based on active state
  const shouldPlay = isActive && isAppActive;
  const effectiveMuted = isMuted || !shouldPlay;

  useEffect(() => {
    setIsMuted(true);
  }, [uri]);

  // Detect natural size from loaded video if metadata wasn't provided
  const handleLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (!metaRatio && (status as any).naturalSize) {
        const ns = (status as any).naturalSize as { width: number; height: number };
        setDetectedRatio(pickRatio(ns.width, ns.height));
      }
    },
    [metaRatio],
  );

  const toggleMute = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation();
    setIsMuted((prev) => !prev);
  }, []);

  return (
    <View style={[styles.container, { aspectRatio: ratioToNumber(finalRatio) }]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isLooping
        isMuted={effectiveMuted}
        onLoad={handleLoad}
        onError={onError}
      />
      <Pressable
        style={styles.muteButton}
        onPress={toggleMute}
        hitSlop={theme.spacing[2]}
        accessibilityRole="button"
        accessibilityLabel={effectiveMuted ? 'Slå lyd til' : 'Slå lyd fra'}
        accessibilityHint="Skifter lyd på videoen"
      >
        <Ionicons
          name={effectiveMuted ? 'volume-mute' : 'volume-high'}
          size={theme.spacing[5]}
          color={theme.colors.text.inverse}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: theme.colors.border.default,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  muteButton: {
    position: 'absolute',
    bottom: theme.spacing[3],
    right: theme.spacing[3],
    backgroundColor: theme.colors.overlay.heavy,
    borderRadius: theme.radius.pill,
    width: theme.spacing[8],
    height: theme.spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
