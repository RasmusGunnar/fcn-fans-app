import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme, Theme } from '../../theme';

export interface AvatarProps {
  userId?: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
}

// Cache successful paths to avoid re-trying failed paths
const pathCache = new Map<string, string>();

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

export function Avatar({ userId, avatarUrl, size = 'md', label }: AvatarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [currentCandidateIndex, setCurrentCandidateIndex] = useState(0);

  const pixelSize = SIZE_MAP[size];

  // Build candidate paths
  const candidatePaths = React.useMemo(() => {
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

  // Generate public URL for a path
  const getPublicUrl = (path: string): string => {
    if (path.startsWith('http')) {
      return path;
    }
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  };

  // Reset when inputs change
  useEffect(() => {
    setCurrentCandidateIndex(0);
    setResolvedUri(null);
    
    // Check cache first
    const cacheKey = candidatePaths.join('|');
    if (pathCache.has(cacheKey)) {
      const cachedUri = pathCache.get(cacheKey)!;
      setResolvedUri(cachedUri);
      return;
    }
    
    // Try first candidate
    if (candidatePaths.length > 0) {
      const uri = getPublicUrl(candidatePaths[0]);
      setResolvedUri(uri);
    }
  }, [userId, avatarUrl, candidatePaths]);

  // Handle image load errors
  const handleError = () => {
    const nextIndex = currentCandidateIndex + 1;
    
    if (nextIndex < candidatePaths.length) {
      // Try next candidate
      setCurrentCandidateIndex(nextIndex);
      const uri = getPublicUrl(candidatePaths[nextIndex]);
      setResolvedUri(uri);
    } else {
      // All candidates failed
      setResolvedUri(null);
    }
  };

  // Handle successful load
  const handleLoad = () => {
    if (resolvedUri && candidatePaths.length > 0) {
      // Cache successful path
      const cacheKey = candidatePaths.join('|');
      pathCache.set(cacheKey, resolvedUri);
    }
  };

  // Render fallback initials
  if (!resolvedUri) {
    const initials = label 
      ? label.substring(0, 2).toUpperCase() 
      : userId 
        ? userId.substring(0, 2).toUpperCase() 
        : '??';
    
    return (
      <View style={[styles.fallback, { width: pixelSize, height: pixelSize, borderRadius: pixelSize / 2 }]}>
        <Text style={[styles.initials, { fontSize: pixelSize * 0.4 }]}>
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={{ width: pixelSize, height: pixelSize, borderRadius: pixelSize / 2 }}
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
