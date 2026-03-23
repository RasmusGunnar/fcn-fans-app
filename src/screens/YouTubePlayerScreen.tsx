import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import YoutubePlayer, { PLAYER_ERRORS, PLAYER_STATES } from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/ui';
import { logger } from '../lib/logger';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type Theme } from '../theme';

type YouTubePlayerRoute = RouteProp<RootStackParamList, 'YouTubePlayer'>;

function getPlayerErrorMessage(error: string | null): string {
  if (error === PLAYER_ERRORS.EMBED_NOT_ALLOWED) {
    return 'Denne YouTube-video kan ikke afspilles i appen.';
  }

  if (error === PLAYER_ERRORS.VIDEO_NOT_FOUND) {
    return 'YouTube-videoen kunne ikke findes.';
  }

  if (error === PLAYER_ERRORS.INVALID_PARAMETER) {
    return 'YouTube-linket er ugyldigt.';
  }

  return 'Kunne ikke indlæse YouTube-video.';
}

export default function YouTubePlayerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<YouTubePlayerRoute>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const [isAppActive, setIsAppActive] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoId = route.params?.videoId ?? '';
  const sourceUrl = route.params?.url ?? '';
  const title = route.params?.title?.trim() || 'YouTube';
  const playerHeight = Math.round((Math.max(width, 1) * 9) / 16);
  const shouldPlay = Boolean(videoId) && isFocused && isAppActive && !playerError;

  useEffect(() => {
    setIsReady(false);
    setPlayerError(null);
    setIsFullscreen(false);
  }, [sourceUrl, videoId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleOpenExternal = useCallback(() => {
    if (!sourceUrl) {
      return;
    }

    Linking.openURL(sourceUrl).catch((error) => {
      logger.warn('[YouTubePlayerScreen] Failed to open YouTube link externally', {
        sourceUrl,
        error,
      });
    });
  }, [sourceUrl]);

  const handlePlayerReady = useCallback(() => {
    setIsReady(true);
    setPlayerError(null);
  }, []);

  const handlePlayerStateChange = useCallback((state: PLAYER_STATES) => {
    if (state !== PLAYER_STATES.UNSTARTED) {
      setIsReady(true);
    }
  }, []);

  const handlePlayerError = useCallback(
    (error: string) => {
      logger.warn('[YouTubePlayerScreen] Failed to load YouTube iframe player', {
        sourceUrl,
        videoId,
        error,
      });
      setPlayerError(error);
      setIsReady(true);
    },
    [sourceUrl, videoId],
  );

  if (!videoId) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={[styles.centerState, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Text variant="bodyBold" color="inverse">
            Kunne ikke åbne YouTube-video
          </Text>
          {sourceUrl ? (
            <Pressable style={styles.primaryButton} onPress={handleOpenExternal}>
              <Text variant="caption" color="inverse">
                Åbn på YouTube
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryButton} onPress={handleClose}>
            <Text variant="caption" color="inverse">
              Luk
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isFullscreen} />

      {!isFullscreen ? (
        <View
          style={[
            styles.topBar,
            {
              paddingTop: insets.top + theme.spacing[2],
              paddingHorizontal: theme.spacing[3],
            },
          ]}
        >
          <Pressable
            style={styles.topBarButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Luk YouTube-afspiller"
          >
            <Ionicons name="close" size={theme.spacing[6]} color={theme.colors.text.inverse} />
          </Pressable>

          <View style={styles.titlePill}>
            <Text variant="caption" color="inverse" numberOfLines={1}>
              {title}
            </Text>
          </View>

          <Pressable
            style={styles.topBarButton}
            onPress={handleOpenExternal}
            accessibilityRole="link"
            accessibilityLabel="Åbn YouTube-link eksternt"
          >
            <Ionicons
              name="open-outline"
              size={theme.components.icon.size.md}
              color={theme.colors.text.inverse}
            />
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.content,
          {
            paddingTop: isFullscreen ? 0 : insets.top + theme.spacing[16],
            paddingBottom: insets.bottom + theme.spacing[4],
          },
        ]}
      >
        {playerError ? (
          <View style={styles.centerState}>
            <Text variant="bodyBold" color="inverse">
              {getPlayerErrorMessage(playerError)}
            </Text>
            <Pressable style={styles.primaryButton} onPress={handleOpenExternal}>
              <Text variant="caption" color="inverse">
                Åbn på YouTube
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.playerShell}>
            <YoutubePlayer
              key={videoId}
              height={playerHeight}
              width={width}
              videoId={videoId}
              play={shouldPlay}
              forceAndroidAutoplay
              onReady={handlePlayerReady}
              onChangeState={handlePlayerStateChange}
              onError={handlePlayerError}
              onFullScreenChange={setIsFullscreen}
              initialPlayerParams={{
                controls: true,
                rel: false,
                preventFullScreen: false,
              }}
              webViewProps={{
                allowsFullscreenVideo: true,
                allowsInlineMediaPlayback: true,
                mediaPlaybackRequiresUserAction: false,
                javaScriptEnabled: true,
                domStorageEnabled: true,
                setSupportMultipleWindows: false,
              }}
            />

            {!isReady ? (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={theme.colors.text.inverse} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.overlay.fullscreen,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 1,
      gap: theme.spacing[2],
    },
    topBarButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    titlePill: {
      flex: 1,
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playerShell: {
      width: '100%',
      backgroundColor: theme.colors.overlay.fullscreen,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay.fullscreen,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[6],
      gap: theme.spacing[4],
    },
    primaryButton: {
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButton: {
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[4],
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.overlay.medium,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
