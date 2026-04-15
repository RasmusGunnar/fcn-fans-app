import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { logger } from '../lib/logger';
import {
  buildCommunityFeedSourceFromCommunity,
  createCommunityFeedItem,
} from '../services/communityFeedApi';
import { geocodeAddress } from '../services/geocoding';
import { createCommunity } from '../services/communities';
import { useFeed } from '../state/FeedContext';
import { useTheme } from '../theme';
import { HOME_FEED_AUDIT_DEBUG_ENABLED } from '../utils/homeFeed';

export default function CreateCommunityScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { addCommunityFeedItem, fetchPosts } = useFeed();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Fejl', 'Navn er paakraevet');
      return;
    }

    setCreating(true);

    try {
      let locationData: {
        location_label?: string | null;
        lat?: number | null;
        lng?: number | null;
        place_name?: string | null;
        geocoded_at?: string | null;
      } = {};

      const trimmedLocation = locationLabel.trim();
      if (trimmedLocation) {
        locationData.location_label = trimmedLocation;

        const addressQuery = trimmedLocation.toLowerCase().includes('danmark')
          ? trimmedLocation
          : `${trimmedLocation}, Danmark`;

        logger.log('[CreateCommunity] Geocoding address:', addressQuery);
        const geocodeResult = await geocodeAddress(addressQuery);

        if (geocodeResult) {
          locationData.lat = geocodeResult.lat;
          locationData.lng = geocodeResult.lng;
          locationData.place_name = geocodeResult.place_name;
          locationData.geocoded_at = new Date().toISOString();
          logger.log('[CreateCommunity] Geocode success:', geocodeResult);
        } else {
          logger.warn('[CreateCommunity] Geocoding failed, continuing without coords');
        }
      }

      const community = await createCommunity(
        name,
        description || null,
        'community',
        'public',
        locationData,
      );

      if (!community) {
        Alert.alert('Fejl', 'Kunne ikke oprette faellesskab');
        setCreating(false);
        return;
      }

      const optimisticCommunityFeedItem = buildCommunityFeedSourceFromCommunity(community);
      if (optimisticCommunityFeedItem) {
        if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
          logger.log('[CreateCommunity][audit] adding optimistic home community item', {
            communityId: optimisticCommunityFeedItem.community_id,
            createdAt: optimisticCommunityFeedItem.created_at,
          });
        }
        addCommunityFeedItem(optimisticCommunityFeedItem);
      }

      const communityFeedItem = await createCommunityFeedItem(community);
      if (communityFeedItem) {
        if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
          logger.log('[CreateCommunity][audit] persisted community feed item created', {
            communityId: communityFeedItem.community_id,
            createdAt: communityFeedItem.created_at,
          });
        }
        addCommunityFeedItem(communityFeedItem);
      } else {
        logger.warn('[CreateCommunity] Community created without persisted feed item entry', {
          communityId: community.id,
        });
      }

      try {
        await fetchPosts();
      } catch (feedRefreshError) {
        logger.warn('[CreateCommunity] Home feed refresh after community create failed', {
          communityId: community.id,
          error: feedRefreshError,
        });
      }

      setCreating(false);

      const successMsg = locationData.lat
        ? 'Faellesskabet er oprettet og vises paa kortet!'
        : 'Faellesskabet er oprettet! Du kan tilfoeje lokation senere.';

      Alert.alert('Succes', successMsg, [
        {
          text: 'OK',
          onPress: () => {
            (navigation as any).navigate('CommunityDetail', {
              id: community.id,
              title: community.name,
            });
          },
        },
      ]);
    } catch (err: any) {
      logger.error('[CreateCommunity] Error:', err);
      Alert.alert('Fejl', err.message || 'Kunne ikke oprette faellesskab');
      setCreating(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.formArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + theme.spacing[6] + theme.spacing[4] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Opret faellesskab</Text>
          <Text style={styles.subtitle}>Saml lokale fans i dit omraade</Text>

          <Text style={styles.label}>Navn *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="F.eks. Ganlose, Egedal, eller Nordsjaelland"
            placeholderTextColor={theme.colors.text.secondary}
          />

          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Fortael om jeres faellesskab..."
            placeholderTextColor={theme.colors.text.secondary}
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Lokation (valgfri)</Text>
          <TextInput
            style={styles.input}
            value={locationLabel}
            onChangeText={setLocationLabel}
            placeholder="F.eks. Ganlose, Kobenhavn, eller Fyn"
            placeholderTextColor={theme.colors.text.secondary}
          />

          <PrimaryButton
            title={creating ? 'Opretter...' : 'Opret faellesskab'}
            onPress={handleCreate}
            disabled={creating}
          />

          <PrimaryButton
            title="Annuller"
            onPress={() => navigation.goBack()}
            disabled={creating}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    formArea: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing[6],
      flexGrow: 1,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing[8],
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
      marginTop: theme.spacing[4],
    },
    input: {
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.sm,
      padding: theme.spacing[4],
      fontSize: 16,
      color: theme.colors.text.primary,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
  });
