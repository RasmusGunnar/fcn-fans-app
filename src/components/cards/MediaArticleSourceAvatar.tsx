import React, { memo, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { defaultTheme } from '../../theme';

type MediaArticleSourceAvatarProps = {
  sourceName: string;
  initials: string;
  avatarUrl?: string | null;
  size?: number;
};

export const MediaArticleSourceAvatar = memo(function MediaArticleSourceAvatar({
  sourceName,
  initials,
  avatarUrl,
  size = 40,
}: MediaArticleSourceAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = useMemo(
    () => (avatarUrl ? { uri: avatarUrl } : null),
    [avatarUrl],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <View
      style={[
        styles.avatar,
        styles.initialsAvatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${sourceName} logo`}
    >
      <Text style={[styles.initials, { fontSize: size * 0.32 }]}>{initials}</Text>
      {imageSource && !imageFailed ? (
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </View>
  );
});

const theme = defaultTheme;

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.card,
  },
  initialsAvatar: {
    backgroundColor: theme.colors.pill.neutral.bg,
  },
  initials: {
    color: theme.colors.pill.neutral.text,
    fontWeight: '700',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
