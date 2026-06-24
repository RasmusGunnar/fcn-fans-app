// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import {
  Audio,
  AVPlaybackStatus,
  InterruptionModeAndroid,
  InterruptionModeIOS,
  ResizeMode,
  Video,
} from 'expo-av';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, GestureResponderEvent, Image, Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { buildInlineVideoPlaybackStatus } from '../../utils/videoPlaybackBehavior';

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
  /** Controlled inline audio state owned by the containing feed card. */
  muted: boolean;
  /** Opens fullscreen playback when the video surface is tapped. */
  onPress?: (event: GestureResponderEvent) => void;
  /** Toggles the controlled inline audio state. */
  onToggleMuted: () => void;
  /** Width/height from media metadata, used to pick aspect ratio. */
  naturalWidth?: number;
  naturalHeight?: number;
  /** Uploaded thumbnail shown while the video is loading. */
  posterUri?: string;
  /** Called once the current video has loaded enough to play. */
  onReady?: () => void;
  /** Called when playback error occurs. */
  onError?: (error: any) => void;
}

/**
 * Instagram-style feed video:
 *  - Autoplay/pause driven by `isActive` + internal AppState foreground tracking.
 *  - Autoplay is muted by default; explicit control toggles sound.
 *  - Loops.
 *  - Aspect ratio derived from natural size (or 4:5 fallback).
 */
export function FeedVideo({
  uri,
  isActive,
  muted,
  onPress,
  onToggleMuted,
  naturalWidth,
  naturalHeight,
  posterUri,
  onReady,
  onError,
}: FeedVideoProps) {
  const videoRef = useRef<Video>(null);
  const isLoadedRef = useRef(false);
  const didNotifyReadyRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const [detectedRatio, setDetectedRatio] = useState<VideoRatio | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [isFirstFrameReady, setIsFirstFrameReady] = useState(false);

  // Track whether the host app is in the foreground so we pause on background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  // Debug: log mount/unmount per video URI
  useEffect(() => {
    if (__DEV__) {
      console.log('[FeedVideo] mounted', { uri });
    }
    return () => {
      if (__DEV__) {
        console.log('[FeedVideo] unmounted', { uri });
      }
    };
  }, [uri]);

  // If we have metadata from the post, use it; else wait for onLoad
  const metaRatio = naturalWidth && naturalHeight ? pickRatio(naturalWidth, naturalHeight) : null;
  const videoSource = useMemo(() => ({ uri }), [uri]);
  const posterSource = useMemo(() => (posterUri ? { uri: posterUri } : undefined), [posterUri]);

  const finalRatio = metaRatio ?? detectedRatio ?? '4:5';

  // Play or pause based on active state
  const shouldPlay = isActive && appActive;
  const effectiveMuted = muted || !shouldPlay;
  const showPosterOverlay = !shouldPlay || !isFirstFrameReady;

  // Debug: log whenever playback intent changes
  useEffect(() => {
    if (__DEV__) {
      console.log('[FeedVideo] shouldPlay →', shouldPlay, { uri });
    }
  }, [shouldPlay, uri]);

  useEffect(() => {
    didNotifyReadyRef.current = false;
    isLoadedRef.current = false;
    setIsFirstFrameReady(false);
  }, [posterUri, uri]);

  useEffect(() => {
    if (!shouldPlay) {
      setIsFirstFrameReady(false);
    }
  }, [shouldPlay]);

  useEffect(
    () => () => {
      isLoadedRef.current = false;
      void videoRef.current?.unloadAsync().catch(() => {});
    },
    [uri],
  );

  // Unload the native player when this item becomes inactive (e.g. another
  // video takes focus) so we never hold more than one loaded player at a time.
  useEffect(() => {
    if (!isActive) {
      isLoadedRef.current = false;
      void videoRef.current?.unloadAsync().catch(() => {});
    }
  }, [isActive]);

  const applyInlinePlaybackStatus = useCallback(async () => {
    if (!isLoadedRef.current || !videoRef.current) {
      return;
    }

    const status = buildInlineVideoPlaybackStatus(shouldPlay, muted);

    try {
      if (!status.isMuted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      }

      await videoRef.current.setStatusAsync(status);
    } catch (error) {
      if (__DEV__) {
        console.warn('[FeedVideo] Failed to apply inline audio status', { uri, error });
      }
      onError?.(error);
    }
  }, [muted, onError, shouldPlay, uri]);

  useEffect(() => {
    void applyInlinePlaybackStatus();
  }, [applyInlinePlaybackStatus]);

  const markFirstFrameReady = useCallback(
    () => {
      setIsFirstFrameReady(true);

      if (didNotifyReadyRef.current) {
        return;
      }

      didNotifyReadyRef.current = true;
      if (__DEV__) {
        console.log('[FeedVideo] ready/playing', {
          uri,
          source: 'readyForDisplay',
          msSinceMount: Date.now() - mountedAtRef.current,
        });
      }
      onReady?.();
    },
    [onReady, uri],
  );

  // Detect natural size from loaded video if metadata wasn't provided
  const handleLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      isLoadedRef.current = true;
      void applyInlinePlaybackStatus();
      if (!metaRatio && (status as any).naturalSize) {
        const ns = (status as any).naturalSize as { width: number; height: number };
        setDetectedRatio(pickRatio(ns.width, ns.height));
      }
    },
    [applyInlinePlaybackStatus, metaRatio],
  );
  const toggleMute = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      onToggleMuted();
    },
    [onToggleMuted],
  );

  return (
    <View style={[styles.container, { aspectRatio: ratioToNumber(finalRatio) }]}>
      <Video
        ref={videoRef}
        source={videoSource}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isLooping
        isMuted={effectiveMuted}
        usePoster={Boolean(posterUri)}
        posterSource={posterSource}
        posterStyle={styles.video}
        onLoad={handleLoad}
        onReadyForDisplay={markFirstFrameReady}
        onError={(error) => {
          if (__DEV__) {
            console.warn('[FeedVideo] playback error', { uri, error });
          }
          onError?.(error);
        }}
      />
      {showPosterOverlay ? (
        <View style={styles.posterOverlay} pointerEvents="none">
          {posterSource ? (
            <Image source={posterSource} style={styles.posterImage} resizeMode="cover" />
          ) : (
            <VideoPosterPlaceholder />
          )}
        </View>
      ) : null}
      <Pressable
        style={styles.mediaPressTarget}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel="Åbn video i fuld skærm"
      />
      {!shouldPlay ? (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <Ionicons
              name="play"
              size={theme.components.icon.size.lg}
              color={theme.colors.text.inverse}
            />
          </View>
        </View>
      ) : null}
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

function VideoPosterPlaceholder() {
  return (
    <View style={styles.posterFallback}>
      <View style={styles.posterFallbackIcon}>
        <Ionicons
          name="play"
          size={theme.components.icon.size.lg}
          color={theme.colors.text.secondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: theme.colors.bg.subtle,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.bg.subtle,
  },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.bg.subtle,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterFallbackIcon: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.card,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.overlay.medium,
    alignItems: 'center',
    justifyContent: 'center',
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
