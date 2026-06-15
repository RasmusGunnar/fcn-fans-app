import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { ResizeMode, Video } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaAudioBootstrap } from '../components/MediaAudioBootstrap';
import { Text } from '../components/ui';
import { logger } from '../lib/logger';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type Theme } from '../theme';
import type { ResolvedMediaItem } from '../utils/media';
import { toggleVideoMuted, VIDEO_MUTED_BY_DEFAULT } from '../utils/videoPlaybackBehavior';

type MediaViewerRoute = RouteProp<RootStackParamList, 'MediaViewer'>;

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export default function MediaViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<MediaViewerRoute>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const listRef = useRef<FlatList<ResolvedMediaItem>>(null);

  const items = Array.isArray(route.params?.items) ? route.params.items : [];
  const initialIndex = clampIndex(route.params?.initialIndex ?? 0, items.length);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAppActive, setIsAppActive] = useState(true);
  const [isMuted, setIsMuted] = useState(VIDEO_MUTED_BY_DEFAULT);

  useEffect(() => {
    if (items.length === 0) {
      navigation.goBack();
    }
  }, [items.length, navigation]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setIsMuted(VIDEO_MUTED_BY_DEFAULT);
  }, [currentIndex]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: width * currentIndex,
        animated: false,
      });
    });
  }, [currentIndex, items.length, width]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = clampIndex(
        Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)),
        items.length,
      );
      setCurrentIndex(nextIndex);
    },
    [items.length, width],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ResolvedMediaItem> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  const handleScrollToIndexFailed = useCallback(
    ({ index }: { index: number }) => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: width * clampIndex(index, items.length),
          animated: false,
        });
      });
    },
    [items.length, width],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMediaItem; index: number }) => {
      const isCurrent = isFocused && isAppActive && index === currentIndex;

      return (
        <View style={[styles.page, { width, height }]}>
          <View
            style={[
              styles.mediaFrame,
              {
                paddingTop: insets.top + theme.spacing[12],
                paddingBottom: insets.bottom + theme.spacing[8],
              },
            ]}
          >
            {item.type === 'video' ? (
              <>
                <Video
                  source={{ uri: item.uri }}
                  style={styles.media}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={isCurrent}
                  isLooping
                  isMuted={isMuted}
                  useNativeControls
                  onError={(error) => {
                    logger.error('[MediaViewerScreen] Video playback error', {
                      uri: item.uri,
                      error,
                    });
                  }}
                />
                {index === currentIndex ? (
                  <Pressable
                    style={[styles.soundButton, { bottom: insets.bottom + theme.spacing[16] }]}
                    onPress={() => setIsMuted((current) => toggleVideoMuted(current))}
                    accessibilityRole="button"
                    accessibilityLabel={isMuted ? 'Slå lyd til' : 'Slå lyd fra'}
                  >
                    <Ionicons
                      name={isMuted ? 'volume-mute' : 'volume-high'}
                      size={theme.spacing[6]}
                      color={theme.colors.text.inverse}
                    />
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Image source={{ uri: item.uri }} style={styles.media} resizeMode="contain" />
            )}
          </View>
        </View>
      );
    },
    [
      currentIndex,
      height,
      insets.bottom,
      insets.top,
      isAppActive,
      isFocused,
      isMuted,
      styles,
      theme,
      width,
    ],
  );

  const pageLabel = `${currentIndex + 1} / ${Math.max(items.length, 1)}`;

  return (
    <View style={styles.container}>
      <MediaAudioBootstrap />
      <StatusBar style="light" />

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item, index) => `${item.uri}-${index}`}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        initialScrollIndex={items.length > 0 ? initialIndex : undefined}
        getItemLayout={getItemLayout}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        extraData={currentIndex}
        windowSize={2}
      />

      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + theme.spacing[2],
            paddingHorizontal: theme.spacing[3],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBarSpacer} />

        {items.length > 1 ? (
          <View style={styles.counterPill}>
            <Text variant="caption" color="inverse">
              {pageLabel}
            </Text>
          </View>
        ) : (
          <View style={styles.counterSpacer} />
        )}

        <Pressable
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Luk medievisning"
        >
          <Ionicons name="close" size={theme.spacing[6]} color={theme.colors.text.inverse} />
        </Pressable>
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
    page: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    mediaFrame: {
      flex: 1,
      width: '100%',
    },
    media: {
      width: '100%',
      height: '100%',
    },
    soundButton: {
      position: 'absolute',
      right: theme.spacing[4],
      width: theme.spacing[11],
      height: theme.spacing[11],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
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
    },
    topBarSpacer: {
      width: theme.spacing[10],
      height: theme.spacing[10],
    },
    counterSpacer: {
      minHeight: theme.spacing[10],
    },
    counterPill: {
      minHeight: theme.spacing[10],
      minWidth: theme.spacing[14],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.heavy,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
