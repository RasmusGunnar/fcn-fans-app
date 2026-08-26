// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS, ResizeMode, Video } from 'expo-av';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, GestureResponderEvent, Image, Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { resolveFeedVideoLifecycle } from '../../utils/videoPlaybackBehavior';

const theme = defaultTheme;

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
  /** Persisted/fallback ratio shared with the poster shell from first paint. */
  aspectRatio: number;
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
 *  - Fixed aspect ratio supplied by the card before player metadata exists.
 */
export function FeedVideo({
  uri,
  isActive,
  muted,
  onPress,
  onToggleMuted,
  aspectRatio,
  posterUri,
  onReady,
  onError,
}: FeedVideoProps) {
  const didNotifyReadyRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
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

  const posterSource = useMemo(() => (posterUri ? { uri: posterUri } : undefined), [posterUri]);

  const lifecycle = resolveFeedVideoLifecycle(isActive, appActive, muted);
  const { mountsPlayer, shouldPlay, isMuted: effectiveMuted } = lifecycle;
  const showPosterOverlay = !shouldPlay || !isFirstFrameReady;

  // Debug: log whenever playback intent changes
  useEffect(() => {
    if (__DEV__) {
      console.log('[FeedVideo] shouldPlay →', shouldPlay, { uri });
    }
  }, [shouldPlay, uri]);

  useEffect(() => {
    didNotifyReadyRef.current = false;
    mountedAtRef.current = Date.now();
  }, [uri]);

  const markFirstFrameLoading = useCallback(() => setIsFirstFrameReady(false), []);

  // Playback and mute intent are declarative Video props. Audio mode setup is
  // the only async side effect, so a stale promise cannot restart/unmute video.
  useEffect(() => {
    if (!shouldPlay || muted) return;

    let cancelled = false;
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((error) => {
      if (cancelled) return;
      if (__DEV__) {
        console.warn('[FeedVideo] Failed to configure inline audio', { uri, error });
      }
      onError?.(error);
    });

    return () => {
      cancelled = true;
    };
  }, [muted, onError, shouldPlay, uri]);

  const markFirstFrameReady = useCallback(() => {
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
  }, [onReady, uri]);
  const toggleMute = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      onToggleMuted();
    },
    [onToggleMuted],
  );

  return (
    <View style={[styles.container, { aspectRatio }]}>
      {mountsPlayer ? (
        <ActiveFeedVideoPlayer
          key={uri}
          uri={uri}
          shouldPlay={shouldPlay}
          muted={effectiveMuted}
          onMount={markFirstFrameLoading}
          onReady={markFirstFrameReady}
          onError={onError}
        />
      ) : null}
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
      {shouldPlay ? (
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
      ) : null}
    </View>
  );
}

type ActiveFeedVideoPlayerProps = {
  uri: string;
  shouldPlay: boolean;
  muted: boolean;
  onMount: () => void;
  onReady: () => void;
  onError?: (error: any) => void;
};

function ActiveFeedVideoPlayer({
  uri,
  shouldPlay,
  muted,
  onMount,
  onReady,
  onError,
}: ActiveFeedVideoPlayerProps) {
  const source = useMemo(() => ({ uri }), [uri]);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    mountedRef.current = true;
    onMount();
    return () => {
      mountedRef.current = false;
    };
  }, [onMount]);

  return (
    <Video
      source={source}
      style={styles.video}
      resizeMode={ResizeMode.COVER}
      shouldPlay={shouldPlay}
      isLooping
      isMuted={muted}
      onReadyForDisplay={() => {
        if (mountedRef.current) onReady();
      }}
      onError={(error) => {
        if (!mountedRef.current) return;
        if (__DEV__) {
          console.warn('[FeedVideo] playback error', { uri, error });
        }
        onError?.(error);
      }}
    />
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
    zIndex: 1,
    elevation: theme.elevation.sm.android,
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
    zIndex: 2,
    elevation: theme.elevation.md.android,
    backgroundColor: theme.colors.overlay.heavy,
    borderRadius: theme.radius.pill,
    width: theme.spacing[8],
    height: theme.spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
