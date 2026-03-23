import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { useEffect } from 'react';
import { logger } from '../lib/logger';

export function MediaAudioBootstrap() {
  useEffect(() => {
    let isMounted = true;

    const configureAudioMode = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        if (isMounted) {
          logger.warn('[MediaAudioBootstrap] Failed to configure audio mode', error);
        }
      }
    };

    void configureAudioMode();

    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}
