import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Alert,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCommunityRole } from '../../hooks/useCommunityRole';
import type { FanActivity } from '../../services/fanActivities';
import { useTheme } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';
import { Text } from '../ui';
import { FanActivityRegistrationSection } from './FanActivityRegistrationSection';
import { getFanActivityVisualPreset } from './fanActivityVisualPresets';

type FanActivityDetailSheetProps = {
  visible: boolean;
  activity: FanActivity | null;
  onClose: () => void;
};

function formatFanActivityTypeLabel(type: string): string {
  const normalized = type.trim();
  if (!normalized) {
    return 'Aktivitet';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFanActivityDateTime(activity: FanActivity): string {
  const start = new Date(activity.starts_at);
  if (Number.isNaN(start.getTime())) {
    return 'Tidspunkt kommer';
  }

  const dateLabel = start.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const startTime = start.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!activity.ends_at) {
    return `${dateLabel}, kl. ${startTime}`;
  }

  const end = new Date(activity.ends_at);
  if (Number.isNaN(end.getTime())) {
    return `${dateLabel}, kl. ${startTime}`;
  }

  const endTime = end.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (start.toDateString() === end.toDateString()) {
    return `${dateLabel}, kl. ${startTime}-${endTime}`;
  }

  const endDateLabel = end.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return `${dateLabel}, kl. ${startTime} - ${endDateLabel}, kl. ${endTime}`;
}

function getFanActivityLocation(activity: FanActivity): string | null {
  const parts = [activity.location_name, activity.location_address]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return Array.from(new Set(parts)).join(' / ');
}

function normalizeCtaUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim() || null;
  if (!normalized) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function getFanActivityIcon(type: string): keyof typeof Ionicons.glyphMap {
  const normalized = type.trim().toLowerCase();

  if (normalized.includes('bus') || normalized.includes('transport')) {
    return 'bus-outline';
  }

  if (
    normalized.includes('optakt') ||
    normalized.includes('samling') ||
    normalized.includes('mad') ||
    normalized.includes('bar') ||
    normalized.includes('pub')
  ) {
    return 'restaurant-outline';
  }

  if (normalized.includes('sang') || normalized.includes('tifo')) {
    return 'musical-notes-outline';
  }

  if (normalized.includes('march')) {
    return 'walk-outline';
  }

  return 'calendar-outline';
}

function InlineMetaRow({
  icon,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.inlineMetaRow}>
      <Ionicons
        name={icon}
        size={theme.typography.body.fontSize}
        color={theme.colors.text.secondary}
      />
      <Text variant="body" color="secondary" style={styles.inlineMetaText}>
        {value}
      </Text>
    </View>
  );
}

export function FanActivityDetailSheet({
  visible,
  activity,
  onClose,
}: FanActivityDetailSheetProps) {
  const navigation = useNavigation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);
  const { role: communityRole } = useCommunityRole(activity?.community_id);

  if (!activity) {
    return null;
  }

  const preset = getFanActivityVisualPreset(theme, activity.type);
  const canEditActivity = communityRole === 'owner' || communityRole === 'admin';
  const location = getFanActivityLocation(activity);
  const communityName = activity.community?.name?.trim() || null;
  const body = activity.body?.trim() || null;
  const ctaLabel = activity.cta_label?.trim() || null;
  const ctaUrl = normalizeCtaUrl(activity.cta_url);
  const metaRows = [
    {
      icon: 'time-outline' as const,
      value: formatFanActivityDateTime(activity),
    },
    ...(location
      ? [
          {
            icon: 'location-outline' as const,
            value: location,
          },
        ]
      : []),
    ...(communityName
      ? [
          {
            icon: 'people-outline' as const,
            value: communityName,
          },
        ]
      : []),
  ];

  const handleOpenCta = async () => {
    if (!ctaUrl) {
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(ctaUrl);
      if (!canOpen) {
        Alert.alert('Kunne ikke åbne link', 'Linket kan ikke åbnes på denne enhed.');
        return;
      }

      await Linking.openURL(ctaUrl);
    } catch {
      Alert.alert('Kunne ikke åbne link', 'Prøv igen senere.');
    }
  };

  const handleEditActivity = () => {
    onClose();
    setTimeout(() => {
      (navigation as any).navigate('CreateFanActivity', {
        parentType: activity.parent_type,
        parentId: activity.parent_id,
        communityId: activity.community_id,
        lockCommunity: true,
        fanActivityId: activity.id,
      });
    }, 0);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView
            style={styles.body}
            contentContainerStyle={[
              styles.bodyContent,
              { paddingBottom: insets.bottom + theme.spacing[5] },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <ImageBackground
              source={preset.source}
              resizeMode="cover"
              style={styles.heroImage}
              imageStyle={styles.heroImageShape}
            >
              <View style={styles.heroSoftener} />
              <LinearGradient
                colors={[theme.colors.overlay.light, theme.colors.overlay.heroScrim]}
                locations={[0.18, 1]}
                style={styles.heroGradient}
              />

              <View style={styles.heroTopBar}>
                <Text variant="small" color="inverse" style={styles.heroEyebrow}>
                  FANAKTIVITET
                </Text>

                <Pressable style={styles.closeButton} onPress={onClose}>
                  <Ionicons
                    name="close"
                    size={theme.typography.body.fontSize}
                    color={theme.colors.text.inverse}
                  />
                </Pressable>
              </View>
            </ImageBackground>

            <View style={styles.contentFlow}>
              <View style={styles.headingBlock}>
                <View
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: preset.chipBg,
                      borderColor: theme.colors.border.subtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={getFanActivityIcon(activity.type)}
                    size={theme.typography.small.lineHeight}
                    color={preset.accentColor}
                  />
                  <Text
                    variant="small"
                    color="secondary"
                    style={[styles.typePillText, { color: preset.chipText }]}
                  >
                    {formatFanActivityTypeLabel(activity.type)}
                  </Text>
                </View>

                <Text variant="h2" color="primary" style={styles.title}>
                  {activity.title}
                </Text>
              </View>

              <View style={styles.metaStack}>
                {metaRows.map((row, index) => (
                  <InlineMetaRow key={`${row.icon}-${index}`} icon={row.icon} value={row.value} />
                ))}
              </View>

              {canEditActivity ? (
                <Pressable style={styles.editCta} onPress={handleEditActivity}>
                  <Ionicons
                    name="create-outline"
                    size={theme.typography.body.fontSize}
                    color={theme.colors.primary}
                  />
                  <Text variant="bodyBold" color="primary" style={styles.editCtaText}>
                    Redigér
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.descriptionSection}>
                <Text variant="small" color="muted" style={styles.descriptionEyebrow}>
                  {body ? 'BESKRIVELSE' : 'OM OPLEVELSEN'}
                </Text>
                <Text variant="body" color="primary" style={styles.bodyText}>
                  {body ||
                    'Aktiviteten er allerede en del af kampdagsoplevelsen. Flere praktiske detaljer kan komme senere, men tid, sted og ramme er på plads, så fans kan planlægge omkring oplevelsen.'}
                </Text>
              </View>

              {activity.registration_enabled ? (
                <FanActivityRegistrationSection activity={activity} visible={visible} />
              ) : null}

              {ctaLabel && ctaUrl ? (
                <View style={styles.ctaWrap}>
                  <PrimaryButton title={ctaLabel} onPress={handleOpenCta} />
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay.medium,
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      maxHeight: '84%',
      backgroundColor: theme.colors.bg.card,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
      overflow: 'hidden',
      paddingTop: theme.spacing[0],
    },
    handle: {
      position: 'absolute',
      top: theme.spacing[3],
      left: 0,
      right: 0,
      zIndex: 3,
      alignSelf: 'center',
      width: theme.spacing[12],
      height: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.card,
      opacity: 0.78,
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      gap: 0,
    },
    heroImage: {
      height: theme.spacing[16] * 3 + theme.spacing[3],
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[8],
      paddingBottom: theme.spacing[4],
    },
    heroImageShape: {
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    heroSoftener: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.bg.card,
      opacity: 0.08,
    },
    heroGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    heroTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    heroEyebrow: {
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    closeButton: {
      width: theme.spacing[9],
      height: theme.spacing[9],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.overlay.light,
    },
    contentFlow: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[4],
      gap: theme.spacing[4],
    },
    headingBlock: {
      gap: theme.spacing[2],
    },
    typePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing[1] / 2,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
    },
    typePillText: {
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    title: {
      fontWeight: '800',
    },
    metaStack: {
      gap: theme.spacing[2],
    },
    editCta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    editCtaText: {
      fontWeight: '700',
    },
    inlineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    inlineMetaText: {
      flex: 1,
      lineHeight: theme.spacing[5],
    },
    descriptionSection: {
      gap: theme.spacing[2],
    },
    ctaWrap: {
      paddingTop: theme.spacing[1],
      marginBottom: theme.spacing[1],
    },
    descriptionEyebrow: {
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    bodyText: {
      lineHeight: theme.spacing[6],
    },
  });
}
