import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { Card } from './ui/Card';
import { PrimaryButton } from './PrimaryButton';
import { Actor, LinkPreview } from '../types/news';
import { fetchLinkPreview, insertNewsItem } from '../services/newsApi';
import { supabase } from '../lib/supabase';

interface NewsComposerProps {
  actor: Actor;
  onSuccess: () => void;
}

export function NewsComposer({ actor, onSuccess }: NewsComposerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const handleFetchPreview = async () => {
    if (!url.trim()) {
      alert('Indtast venligst en URL');
      return;
    }

    // Basic URL validation
    let validatedUrl: URL;
    try {
      validatedUrl = new URL(url.trim());
      if (!validatedUrl.protocol.startsWith('http')) {
        throw new Error('URL skal starte med http:// eller https://');
      }
    } catch {
      alert('Ugyldig URL. Sørg for at den starter med http:// eller https://');
      return;
    }

    setLoadingPreview(true);
    setPreviewError(null);
    setPreview(null);

    console.log('[NewsComposer] Fetching preview for URL:', url.trim());

    try {
      const previewData = await fetchLinkPreview(url.trim());
      console.log('[NewsComposer] Preview fetched successfully:', {
        title: previewData.title,
        siteName: previewData.siteName,
        hasImage: !!previewData.imageUrl,
        hasDescription: !!previewData.description,
      });
      setPreview(previewData);
    } catch (error: any) {
      const errorMsg = error?.message || 'Kunne ikke hente preview';
      console.error('[NewsComposer] Preview fetch error:', {
        message: errorMsg,
        error,
      });
      setPreviewError(errorMsg);
      alert('Kunne ikke hente preview: ' + errorMsg);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePublish = async () => {
    if (!preview) {
      alert('Hent venligst preview først');
      return;
    }

    if (!preview.title && !preview.description) {
      alert('Preview skal have mindst en titel eller beskrivelse');
      return;
    }

    // Validate actor - actor_id must not be null
    if (!actor.id) {
      alert('Fejl: Ingen actor valgt. Vælg venligst hvem der deler nyheden.');
      return;
    }

    // If posting as community, validate actor_id is a valid string/uuid
    if (actor.type === 'community') {
      if (!actor.id || typeof actor.id !== 'string' || actor.id.trim().length === 0) {
        alert('Fejl: Community ID er ugyldig. Vælg venligst en community.');
        return;
      }
    }

    setPublishing(true);

    try {
      // Get current user ID from Supabase auth
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      console.log('\n========== DIAGNOSE: Del nyhed ==========');
      console.log('[News actor selected]:', {
        type: actor.type,
        id: actor.id,
        name: actor.name,
      });
      console.log('[Current user]:', {
        id: user.id,
      });

      // Build payload to match RLS policy exactly
      const newsData = {
        url: preview.url,
        title: preview.title || undefined,
        description: preview.description || undefined,
        imageUrl: preview.imageUrl || undefined,
        siteName: preview.siteName || undefined,
        createdBy: user.id, // Must be current user
        actorType: actor.type, // 'user' or 'community'
        // For user posting: actor_id = user.id
        // For community posting: actor_id = community.id
        actorId: actor.type === 'user' ? user.id : actor.id,
        // community_id only set when posting as community
        communityId: actor.type === 'community' ? actor.id : undefined,
      };

      // ============================================================
      // REAL JSON logs for debugging (only runs on "Del nyhed" click)
      // ============================================================
      console.log('\n\n');
      console.log('###NEWSDBG### ===== START NEWS INSERT =====');
      console.log(
        '###NEWSDBG### selectedActor',
        JSON.stringify({
          type: actor.type,
          id: actor.id,
          name: actor.name,
        }),
      );
      console.log(
        '###NEWSDBG### payload',
        JSON.stringify({
          created_by: newsData.createdBy,
          actor_type: newsData.actorType,
          actor_id: newsData.actorId,
          community_id: newsData.communityId,
          url: newsData.url,
          title: newsData.title,
          description: newsData.description,
          image_url: newsData.imageUrl,
          site_name: newsData.siteName,
        }),
      );
      console.log('###NEWSDBG### ===========================');
      console.log('\n');

      await insertNewsItem(newsData);

      console.log('\n');
      console.log('###NEWSDBG### ===== SUCCESS =====');
      console.log('###NEWSDBG### News published successfully');
      console.log('###NEWSDBG### ===================');
      console.log('\n\n');

      // Reset form
      setUrl('');
      setPreview(null);
      setPreviewError(null);
      onSuccess();
    } catch (error: any) {
      console.log('\n\n');
      console.log('###NEWSDBG### ===== ERROR =====');
      console.log(
        '###NEWSDBG### error',
        JSON.stringify({
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        }),
      );
      console.log('###NEWSDBG### error raw', error);
      console.log('###NEWSDBG### ===============');
      console.log('\n\n');

      const errorMsg = error?.message || 'Kunne ikke dele nyhed';
      console.error('[NewsComposer] Publish error:', {
        message: errorMsg,
        error,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      alert('Kunne ikke dele nyhed: ' + errorMsg);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Link URL</Text>
      <TextInput
        style={styles.input}
        placeholder="https://example.com/article"
        placeholderTextColor={theme.colors.text.secondary}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!loadingPreview && !publishing}
      />

      <Pressable
        style={[
          styles.previewButton,
          (loadingPreview || !url.trim()) && styles.previewButtonDisabled,
        ]}
        onPress={handleFetchPreview}
        disabled={loadingPreview || !url.trim()}
      >
        {loadingPreview ? (
          <>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.previewButtonText}>Henter preview...</Text>
          </>
        ) : (
          <>
            <Ionicons name="link" size={20} color={theme.colors.primary} />
            <Text style={styles.previewButtonText}>Hent preview</Text>
          </>
        )}
      </Pressable>

      {previewError && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color={theme.colors.primary} />
          <Text style={styles.errorText}>{previewError}</Text>
        </View>
      )}

      {preview && (
        <Card style={styles.previewCard}>
          {preview.imageUrl && (
            <Image
              source={{ uri: preview.imageUrl }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.previewContent}>
            {preview.siteName && <Text style={styles.previewSiteName}>{preview.siteName}</Text>}
            {preview.title && (
              <Text style={styles.previewTitle} numberOfLines={2}>
                {preview.title}
              </Text>
            )}
            {preview.description && (
              <Text style={styles.previewDescription} numberOfLines={3}>
                {preview.description}
              </Text>
            )}
          </View>
        </Card>
      )}

      <PrimaryButton
        title={publishing ? 'Deler...' : 'Del nyhed'}
        onPress={handlePublish}
        disabled={!preview || publishing || (!preview?.title && !preview?.description)}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  container: {
    gap: theme.spacing[4],
  },
  label: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  input: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text.primary,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  previewButtonDisabled: {
    opacity: 0.5,
  },
  previewButtonText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.bg.card,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.primary,
  },
  previewCard: {
    padding: theme.spacing[0],
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 180,
    backgroundColor: theme.colors.border.default,
  },
  previewContent: {
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  previewSiteName: {
    fontSize: theme.typography.small.fontSize,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight as any,
    color: theme.colors.text.primary,
  },
  previewDescription: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.body.lineHeight,
  },
  });
}
