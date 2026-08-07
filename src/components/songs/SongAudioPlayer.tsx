import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { formatSongAudioTime, getSongAudioDisplayPosition } from '../../utils/songAudio';

const theme = defaultTheme;
const LOAD_TIMEOUT_MS = 15_000;

type SongAudioPlayerProps = {
  url: string;
};

export function SongAudioPlayer({ url }: SongAudioPlayerProps) {
  const player = useAudioPlayer(url, { updateInterval: 250, downloadFirst: false });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const playbackFailed = loadTimedOut || status.playbackState.toLowerCase().includes('error');
  const displayPosition = getSongAudioDisplayPosition(
    status.currentTime,
    status.duration,
    status.didJustFinish,
  );
  const progress = status.duration > 0 ? displayPosition / status.duration : 0;

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
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') player.pause();
    });

    return () => {
      subscription.remove();
      player.pause();
      void player.seekTo(0).catch(() => undefined);
    };
  }, [player]);

  useEffect(() => {
    if (status.isLoaded) {
      setLoadTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [retryAttempt, status.isLoaded]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    void player.seekTo(0).catch(() => undefined);
  }, [player, status.didJustFinish]);

  const handlePlayPause = () => {
    if (!status.isLoaded || playbackFailed) return;
    if (status.playing) {
      player.pause();
      return;
    }
    player.play();
  };

  const seekToFraction = (fraction: number) => {
    if (!status.isLoaded || status.duration <= 0) return;
    void player.seekTo(Math.max(0, Math.min(1, fraction)) * status.duration).catch(() => undefined);
  };

  const retry = () => {
    player.pause();
    setLoadTimedOut(false);
    setRetryAttempt((current) => current + 1);
    player.replace(url);
  };

  if (playbackFailed) {
    return (
      <View style={styles.container}>
        <View style={styles.errorRow}>
          <Ionicons
            name="alert-circle-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>Lydfilen kunne ikke afspilles.</Text>
        </View>
        <Pressable
          onPress={retry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Prøv at indlæse lydfilen igen"
        >
          <Ionicons
            name="refresh"
            size={theme.components.icon.size.sm}
            color={theme.colors.brand.accent}
          />
          <Text style={styles.retryText}>Prøv igen</Text>
        </Pressable>
      </View>
    );
  }

  const loading = !status.isLoaded;

  return (
    <View style={styles.container} accessibilityLabel="Sanglyd">
      <View style={styles.controlsRow}>
        <Pressable
          onPress={handlePlayPause}
          disabled={loading}
          style={({ pressed }) => [
            styles.playButton,
            loading && styles.disabled,
            pressed && !loading && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Sæt sanglyd på pause' : 'Afspil sanglyd'}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.text.inverse} />
          ) : (
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={theme.components.icon.size.md}
              color={theme.colors.text.inverse}
            />
          )}
        </Pressable>

        <View style={styles.timeline}>
          <Pressable
            onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              if (trackWidth > 0) seekToFraction(event.nativeEvent.locationX / trackWidth);
            }}
            onAccessibilityAction={(event) => {
              const delta = event.nativeEvent.actionName === 'increment' ? 10 : -10;
              seekToFraction((displayPosition + delta) / Math.max(status.duration, 1));
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            accessibilityRole="adjustable"
            accessibilityLabel="Afspilningsposition"
            accessibilityValue={{
              min: 0,
              max: Math.round(status.duration),
              now: Math.round(displayPosition),
            }}
            disabled={loading || status.duration <= 0}
            style={styles.progressTouchTarget}
          >
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(0, Math.min(100, progress * 100))}%` },
                ]}
              />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>
              {formatSongAudioTime(displayPosition)} /{' '}
              {formatSongAudioTime(status.duration > 0 ? status.duration : null)}
            </Text>
            {status.isBuffering && status.playing ? (
              <ActivityIndicator size="small" color={theme.colors.text.secondary} />
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing[3],
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.surface,
    gap: theme.spacing[3],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  playButton: {
    width: theme.spacing[11],
    height: theme.spacing[11],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brand.accent,
  },
  timeline: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  progressTouchTarget: {
    height: theme.spacing[6],
    justifyContent: 'center',
  },
  progressTrack: {
    height: theme.spacing[1],
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.subtle,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.brand.accent,
  },
  timeRow: {
    minHeight: theme.spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    ...theme.typography.small,
    color: theme.colors.text.secondary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  errorText: {
    ...theme.typography.small,
    color: theme.colors.error,
    flex: 1,
  },
  retryButton: {
    minHeight: theme.spacing[10],
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  retryText: {
    ...theme.typography.bodyBold,
    color: theme.colors.brand.accent,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
