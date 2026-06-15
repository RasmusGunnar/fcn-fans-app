import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import {
  createMediaArticlePost,
  MediaArticleApiError,
} from '../services/mediaArticleApi';
import { fetchLinkPreview } from '../services/newsApi';
import { useFeed } from '../state/FeedContext';
import { Theme, useTheme } from '../theme';
import type { LinkPreview } from '../types/news';
import { normalizeMediaArticleUrl } from '../utils/mediaArticle';
import { ArticlePreview } from './cards/ArticlePreview';
import { PrimaryButton } from './PrimaryButton';
import { Card } from './ui/Card';

interface MediaArticleComposerProps {
  onSuccess: () => void;
}

export function MediaArticleComposer({ onSuccess }: MediaArticleComposerProps) {
  const { user, isAppAdmin } = useAuth();
  const { addPost, fetchPosts } = useFeed();
  const theme = useTheme();
  const styles = createStyles(theme);
  const requestIdRef = useRef(0);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const normalizedUrl = normalizeMediaArticleUrl(url);
  const currentPreview = normalizedUrl && previewUrl === normalizedUrl ? preview : null;

  const loadPreview = async (targetUrl: string): Promise<LinkPreview | null> => {
    const requestId = ++requestIdRef.current;
    setLoadingPreview(true);
    setPreviewError(false);

    try {
      const metadata = await fetchLinkPreview(targetUrl);
      const nextPreview = {
        ...metadata,
        url: targetUrl,
      };

      if (requestId === requestIdRef.current) {
        setPreview(nextPreview);
        setPreviewUrl(targetUrl);
      }

      return nextPreview;
    } catch (error) {
      logger.warn('[MediaArticleComposer] Preview fetch failed:', {
        url: targetUrl,
        error,
      });

      if (requestId === requestIdRef.current) {
        setPreview(null);
        setPreviewUrl(null);
        setPreviewError(true);
      }

      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        setLastAttemptedUrl(targetUrl);
        setLoadingPreview(false);
      }
    }
  };

  useEffect(() => {
    if (!normalizedUrl) {
      requestIdRef.current += 1;
      setPreview(null);
      setPreviewUrl(null);
      setLastAttemptedUrl(null);
      setPreviewError(Boolean(url.trim()));
      setLoadingPreview(false);
      return;
    }

    setPreviewError(false);
    const timer = setTimeout(() => {
      void loadPreview(normalizedUrl);
    }, 700);

    return () => clearTimeout(timer);
    // loadPreview intentionally follows the current URL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, normalizedUrl]);

  const handlePublish = async () => {
    if (!user?.id || !isAppAdmin) {
      Alert.alert('Ingen adgang', 'Kun app-administratorer kan oprette medieartikler.');
      return;
    }

    if (!normalizedUrl) {
      Alert.alert('Ugyldigt link', 'Indtast en gyldig http- eller https-URL.');
      return;
    }

    setPublishing(true);

    try {
      let metadata = currentPreview;
      if (!metadata && lastAttemptedUrl !== normalizedUrl) {
        metadata = await loadPreview(normalizedUrl);
      }

      const post = await createMediaArticlePost({
        authorId: user.id,
        url: normalizedUrl,
        caption,
        preview: metadata,
      });

      addPost(post);
      setUrl('');
      setCaption('');
      setPreview(null);
      setPreviewUrl(null);
      setLastAttemptedUrl(null);
      onSuccess();

      void fetchPosts().catch((error) => {
        logger.warn('[MediaArticleComposer] Feed refresh failed after insert:', error);
      });
    } catch (error) {
      if (error instanceof MediaArticleApiError) {
        if (error.kind === 'DUPLICATE_URL') {
          Alert.alert('Allerede importeret', 'Denne artikel findes allerede i feedet.');
        } else {
          Alert.alert('Ingen adgang', error.message);
        }
      } else {
        logger.error('[MediaArticleComposer] Publish failed:', error);
        Alert.alert('Kunne ikke udgive', 'Artiklen blev ikke oprettet. Pr\u00f8v igen.');
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.sectionCard}>
        <Text style={styles.label}>Artikel-URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://example.com/artikel"
          placeholderTextColor={theme.colors.text.secondary}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          editable={!publishing}
        />

        {loadingPreview ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={theme.colors.state.success} />
            <Text style={styles.statusText}>Henter preview...</Text>
          </View>
        ) : null}

        {!loadingPreview && previewError && normalizedUrl ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusText}>
              Preview kunne ikke hentes. Artiklen kan stadig udgives med linket.
            </Text>
            <Pressable onPress={() => void loadPreview(normalizedUrl)}>
              <Text style={styles.retryText}>Pr\u00f8v igen</Text>
            </Pressable>
          </View>
        ) : null}

        {!normalizedUrl && url.trim() ? (
          <Text style={styles.errorText}>Brug en gyldig http- eller https-URL.</Text>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.label}>Tekst (valgfrit)</Text>
        <TextInput
          style={[styles.input, styles.captionInput]}
          placeholder="Tilf\u00f8j en kort introduktion..."
          placeholderTextColor={theme.colors.text.secondary}
          value={caption}
          onChangeText={setCaption}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!publishing}
        />
      </Card>

      {currentPreview ? (
        <Card style={styles.previewCard}>
          <Text style={styles.previewLabel}>Preview</Text>
          <ArticlePreview preview={currentPreview} />
        </Card>
      ) : null}

      <PrimaryButton
        title={publishing ? 'Udgiver...' : 'Udgiv artikel'}
        onPress={handlePublish}
        disabled={!normalizedUrl || publishing}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[5],
    },
    sectionCard: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    label: {
      marginBottom: theme.spacing[2],
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    input: {
      padding: theme.spacing[4],
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
      color: theme.colors.text.primary,
      fontSize: 15,
    },
    captionInput: {
      minHeight: 112,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    statusBlock: {
      gap: theme.spacing[1],
      marginTop: theme.spacing[2],
    },
    statusText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    retryText: {
      color: theme.colors.state.success,
      fontSize: 13,
      fontWeight: '700',
    },
    errorText: {
      marginTop: theme.spacing[2],
      color: theme.colors.state.error,
      fontSize: 13,
    },
    previewCard: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    previewLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
  });
}
