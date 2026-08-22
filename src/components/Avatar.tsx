import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Image, type ImageLoadEvent } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme, Theme } from '../theme';

const AVATAR_DEBUG_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_AVATAR_DEBUG?.trim().toLowerCase() === 'true';

interface AvatarProps {
  userId?: string;
  avatarUrl?: string | null;
  size?: number;
  label?: string;
}

// Cache successful paths to avoid re-trying failed paths
const pathCache = new Map<string, string>();

function getPublicAvatarUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

function getInitialAvatarUri(candidatePaths: string[]): string | null {
  const cacheKey = candidatePaths.join('|');
  const cachedUri = pathCache.get(cacheKey);
  if (cachedUri) return cachedUri;
  return candidatePaths[0] ? getPublicAvatarUrl(candidatePaths[0]) : null;
}

type AvatarResolution = {
  cacheKey: string;
  candidateIndex: number;
  uri: string | null;
};

function createInitialAvatarResolution(candidatePaths: string[]): AvatarResolution {
  const cacheKey = candidatePaths.join('|');
  const uri = getInitialAvatarUri(candidatePaths);
  const cachedCandidateIndex = uri
    ? candidatePaths.findIndex((path) => getPublicAvatarUrl(path) === uri)
    : -1;

  return {
    cacheKey,
    candidateIndex: Math.max(0, cachedCandidateIndex),
    uri,
  };
}

export function Avatar({ userId, avatarUrl, size = 32, label }: AvatarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Build candidate paths
  const candidatePaths = useMemo(() => {
    const paths: string[] = [];

    // If avatarUrl starts with http, use it directly
    if (avatarUrl && avatarUrl.startsWith('http')) {
      return [avatarUrl];
    }

    // Otherwise, build candidate paths in the avatars bucket
    if (avatarUrl) {
      paths.push(avatarUrl);
    }

    if (userId) {
      paths.push(`${userId}/avatar.jpg`);
      paths.push(`${userId}.jpg`);
    }

    // De-duplicate
    return [...new Set(paths)];
  }, [userId, avatarUrl]);
  const cacheKey = useMemo(() => candidatePaths.join('|'), [candidatePaths]);
  const [resolution, setResolution] = useState<AvatarResolution>(() =>
    createInitialAvatarResolution(candidatePaths),
  );
  const activeResolution =
    resolution.cacheKey === cacheKey ? resolution : createInitialAvatarResolution(candidatePaths);
  const requestKey = `${cacheKey}:${activeResolution.uri ?? 'fallback'}`;
  const committedRequestKeyRef = useRef(requestKey);

  useLayoutEffect(() => {
    committedRequestKeyRef.current = requestKey;
  }, [requestKey]);

  // Reset when inputs change
  useEffect(() => {
    setResolution((current) => {
      if (current.cacheKey === cacheKey) return current;
      const next = createInitialAvatarResolution(candidatePaths);
      if (next.uri && pathCache.has(cacheKey) && AVATAR_DEBUG_ENABLED) {
        console.log('[AvatarDebug]', {
          userId,
          avatarUrl,
          tried: candidatePaths,
          finalUri: next.uri,
          source: 'cache',
        });
      }
      return next;
    });
  }, [userId, avatarUrl, cacheKey, candidatePaths]);

  // Handle image load errors
  const handleError = () => {
    if (committedRequestKeyRef.current !== requestKey) return;

    const nextIndex = activeResolution.candidateIndex + 1;

    if (nextIndex < candidatePaths.length) {
      // Try next candidate
      setResolution({
        cacheKey,
        candidateIndex: nextIndex,
        uri: getPublicAvatarUrl(candidatePaths[nextIndex]),
      });
    } else {
      // All candidates failed
      setResolution({ cacheKey, candidateIndex: nextIndex, uri: null });
      if (AVATAR_DEBUG_ENABLED) {
        console.log('[AvatarDebug]', {
          userId,
          avatarUrl,
          tried: candidatePaths,
          finalUri: null,
          result: 'all-failed',
        });
      }
    }
  };

  // Handle successful load
  const handleLoad = (event: ImageLoadEvent) => {
    const eventUri = event.nativeEvent.source.uri;
    if (
      eventUri &&
      candidatePaths.length > 0 &&
      committedRequestKeyRef.current === requestKey &&
      activeResolution.uri === eventUri
    ) {
      // Cache successful path
      pathCache.set(cacheKey, eventUri);

      if (AVATAR_DEBUG_ENABLED) {
        console.log('[AvatarDebug]', {
          userId,
          avatarUrl,
          tried: candidatePaths,
          finalUri: eventUri,
          candidateIndex: activeResolution.candidateIndex,
        });
      }
    }
  };

  // Render fallback initials
  if (!activeResolution.uri) {
    const initials = label
      ? label.substring(0, 2).toUpperCase()
      : userId
        ? userId.substring(0, 2).toUpperCase()
        : '??';

    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
      </View>
    );
  }

  return (
    <Image
      key={requestKey}
      source={{ uri: activeResolution.uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={handleError}
      onLoad={handleLoad}
      resizeMode="cover"
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fallback: {
      backgroundColor: theme.colors.state.error,
      justifyContent: 'center',
      alignItems: 'center',
    },
    initials: {
      color: theme.colors.bg.elevated,
      fontWeight: 'bold',
    },
  });
}
