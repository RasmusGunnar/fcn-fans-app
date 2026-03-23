import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { cleanText } from '../../utils/text';
import { Card, OutlineButton, Text } from '../ui';

type CommunityCardProps = {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  onPressJoin?: () => void;
};

const DESCRIPTION_FALLBACK = 'Et nyt fællesskab er klar til fans, der vil samles omkring FCN.';

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'FC'
  );
}

export function CommunityCard({
  name,
  description,
  avatarUrl,
  coverUrl,
  onPressJoin,
}: CommunityCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const cleanedName = cleanText(name).trim() || 'Nyt fællesskab';
  const cleanedDescription = cleanText(description).trim() || DESCRIPTION_FALLBACK;
  const mediaUrl = cleanText(avatarUrl).trim() || cleanText(coverUrl).trim() || null;
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [mediaUrl]);

  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <Pressable
          onPress={onPressJoin}
          disabled={!onPressJoin}
          style={({ pressed }) => [
            styles.cardPressable,
            pressed && onPressJoin ? styles.pressed : null,
          ]}
        >
          <View style={styles.mediaWrap}>
            {mediaUrl && !imageFailed ? (
              <Image
                source={{ uri: mediaUrl }}
                style={styles.media}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={[styles.media, styles.placeholder]}>
                <View style={styles.placeholderOrb}>
                  <Text variant="bodyBold" style={styles.placeholderText}>
                    {getInitials(cleanedName)}
                  </Text>
                </View>
                <Text variant="caption" color="secondary" style={styles.placeholderLabel}>
                  FCN fans
                </Text>
              </View>
            )}
          </View>

          <View style={styles.textContent}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text variant="caption" color="secondary" style={styles.eyebrow}>
                Nyt fællesskab
              </Text>
            </View>

            <View style={styles.copyBlock}>
              <Text variant="h3" numberOfLines={2}>
                {cleanedName}
              </Text>
              <Text variant="body" color="secondary" numberOfLines={3} style={styles.description}>
                {cleanedDescription}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.actionRow}>
          <View style={styles.buttonWrap}>
            <OutlineButton title="Deltag i fællesskabet" onPress={onPressJoin || (() => {})} fullWidth />
          </View>
        </View>
      </View>
    </Card>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.layout.listGap,
      padding: theme.spacing[0],
      backgroundColor: theme.colors.bg.surface,
    },
    content: {
      paddingHorizontal: theme.layout.cardPadding,
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[4],
      gap: theme.spacing[4],
    },
    cardPressable: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[5],
    },
    pressed: {
      opacity: 0.9,
    },
    mediaWrap: {
      width: theme.spacing[16],
      height: theme.spacing[16],
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
      flexShrink: 0,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    media: {
      width: '100%',
      height: '100%',
      borderRadius: theme.radius.lg,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[2],
    },
    placeholderOrb: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.surface,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
    },
    placeholderText: {
      color: theme.colors.brand.accent,
    },
    placeholderLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    textContent: {
      flex: 1,
      paddingTop: theme.spacing[1],
      gap: theme.spacing[2],
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    eyebrowDot: {
      width: theme.spacing[2],
      height: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.brand.accent,
    },
    eyebrow: {
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    copyBlock: {
      gap: theme.spacing[2],
    },
    description: {
      lineHeight: 22,
    },
    actionRow: {
      flexDirection: 'row',
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.subtle,
      paddingTop: theme.spacing[4],
      marginTop: theme.spacing[1],
    },
    buttonWrap: {
      width: '100%',
    },
  });
