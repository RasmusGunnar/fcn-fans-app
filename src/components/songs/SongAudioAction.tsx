import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { logger } from '../../lib/logger';
import { defaultTheme } from '../../theme';
import {
  pauseSongAudioForCleanup,
  replaceSongAudioSource,
  stopAndResetSongAudioForCleanup,
  type SongAudioCleanupReporter,
} from '../../utils/songAudioNative';
import {
  claimSongAudioPlayback,
  registerSongAudioPlayback,
  releaseSongAudioPlayback,
} from '../../utils/songAudioPlayback';

const theme = defaultTheme;
const LOAD_TIMEOUT_MS = 15_000;

type SongAudioActionProps = {
  songId: string;
  title: string;
  url: string;
};

export function SongAudioAction({ songId, title, url }: SongAudioActionProps) {
  const player = useAudioPlayer(url, { updateInterval: 250, downloadFirst: false });
  const status = useAudioPlayerStatus(player);
  const owner = useRef(Symbol(`song-audio-action:${songId}`)).current;
  const retrying = useRef(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [playWhenLoaded, setPlayWhenLoaded] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const reportCleanupError = useCallback<SongAudioCleanupReporter>((operation, error) => {
    logger.warn(`[SongAudioAction] ${operation} cleanup failed.`, error);
  }, []);

  const stopAndReset = useCallback(() => {
    void stopAndResetSongAudioForCleanup(player, reportCleanupError);
  }, [player, reportCleanupError]);

  const pauseForCleanup = useCallback(() => {
    releaseSongAudioPlayback(owner);
    pauseSongAudioForCleanup(player, reportCleanupError);
  }, [owner, player, reportCleanupError]);

  const pauseForUser = useCallback(() => {
    try {
      player.pause();
      releaseSongAudioPlayback(owner);
    } catch (error) {
      logger.warn('[SongAudioAction] Pause failed.', error);
      setPlaybackFailed(true);
    }
  }, [owner, player]);

  const play = useCallback(() => {
    if (!claimSongAudioPlayback(owner)) return;
    try {
      player.play();
    } catch (error) {
      releaseSongAudioPlayback(owner);
      logger.warn('[SongAudioAction] Playback failed.', error);
      setPlaybackFailed(true);
    }
  }, [owner, player]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'doNotMix',
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    return registerSongAudioPlayback(owner, songId, stopAndReset);
  }, [owner, songId, stopAndReset]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setPlayWhenLoaded(false);
        pauseForCleanup();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pauseForCleanup]);

  useEffect(() => {
    if (status.isLoaded) {
      retrying.current = false;
      setPlaybackFailed(false);
      if (playWhenLoaded) {
        setPlayWhenLoaded(false);
        if (AppState.currentState === 'active') play();
      }
      return;
    }

    const timeout = setTimeout(() => {
      retrying.current = false;
      setPlayWhenLoaded(false);
      setPlaybackFailed(true);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [play, playWhenLoaded, retryAttempt, status.isLoaded]);

  useEffect(() => {
    if (!status.playbackState.toLowerCase().includes('error') || retrying.current) return;
    releaseSongAudioPlayback(owner);
    setPlayWhenLoaded(false);
    setPlaybackFailed(true);
  }, [owner, status.playbackState]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    releaseSongAudioPlayback(owner);
    stopAndReset();
  }, [owner, status.didJustFinish, stopAndReset]);

  const retry = () => {
    try {
      player.pause();
      releaseSongAudioPlayback(owner);
      retrying.current = true;
      setPlaybackFailed(false);
      setPlayWhenLoaded(true);
      setRetryAttempt((current) => current + 1);
      replaceSongAudioSource(player, url);
    } catch (error) {
      logger.warn('[SongAudioAction] Reload failed.', error);
      setPlayWhenLoaded(false);
      setPlaybackFailed(true);
    }
  };

  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (status.playing) {
      pauseForUser();
      return;
    }
    if (playbackFailed) {
      retry();
      return;
    }
    play();
  };

  const loading = !status.isLoaded && !playbackFailed;
  const playing = status.playing && !playbackFailed;
  const actionLabel = playing ? 'Pause' : 'Afspil';

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        disabled={loading}
        style={({ pressed }) => [
          styles.button,
          loading && styles.disabled,
          pressed && !loading && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} lyd til ${title}`}
        accessibilityState={{ disabled: loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.text.inverse} />
        ) : (
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={theme.components.icon.size.sm}
            color={theme.colors.text.inverse}
          />
        )}
        <Text style={styles.text}>{actionLabel}</Text>
      </Pressable>
      {playbackFailed ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          Lydfilen kunne ikke afspilles.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  button: {
    minHeight: theme.spacing[11],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[2],
  },
  text: {
    ...theme.typography.small,
    color: theme.colors.text.inverse,
  },
  error: {
    ...theme.typography.small,
    color: theme.colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
