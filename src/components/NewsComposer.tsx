import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  findNodeHandle,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { fetchLinkPreview, insertNewsItem } from '../services/newsApi';
import { Theme, useTheme } from '../theme';
import { Actor, LinkPreview } from '../types/news';
import { PrimaryButton } from './PrimaryButton';
import { Card } from './ui/Card';

interface NewsComposerProps {
  actor: Actor;
  onSuccess: () => void;
}

function normalizeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const validatedUrl = new URL(trimmed);
    if (validatedUrl.protocol !== 'http:' && validatedUrl.protocol !== 'https:') {
      return null;
    }
    return validatedUrl.toString();
  } catch {
    return null;
  }
}

export function NewsComposer({ actor, onSuccess }: NewsComposerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const newsAccent = theme.colors.state.success;
  const scrollRef = useRef<ScrollView>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const urlInputRef = useRef<TextInput>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [body, setBody] = useState('');
  const [lastFetchedUrl, setLastFetchedUrl] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const normalizedUrl = normalizeHttpUrl(url);
  const showPreviewSuccess = !!preview && !loadingPreview && normalizedUrl === lastFetchedUrl;

  // Keyboard height tracking for stable scroll behavior
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const scrollToInput = (inputRef: React.RefObject<TextInput | null>, extraOffset: number = theme.spacing[6]) => {
    requestAnimationFrame(() => {
      const node = findNodeHandle(inputRef.current);
      if (!node) {
        return;
      }
      const responder = scrollRef.current?.getScrollResponder?.();
      responder?.scrollResponderScrollNativeHandleToKeyboard(node, extraOffset, true);
    });
  };

  const handleBodyEndEditing = () => {
    if (url.trim().length === 0) {
      requestAnimationFrame(() => {
        urlInputRef.current?.focus();
        scrollToInput(urlInputRef);
      });
    }
  };

  const handleFetchPreview = async (targetUrl: string, force = false) => {
    if (!force && targetUrl === lastFetchedUrl) {
      return;
    }

    setLoadingPreview(true);
    setPreviewError(null);
    setPreview(null);

    logger.log('[NewsComposer] Fetching preview for URL:', targetUrl);

    try {
      const previewData = await fetchLinkPreview(targetUrl);
      logger.log('[NewsComposer] Preview fetched successfully:', {
        title: previewData.title,
        siteName: previewData.siteName,
        hasImage: !!previewData.imageUrl,
        hasDescription: !!previewData.description,
      });
      setPreview(previewData);
      setLastFetchedUrl(targetUrl);
    } catch (error) {
      logger.error('[NewsComposer] Preview fetch error:', {
        message: 'Kunne ikke hente preview',
        error,
      });
      setPreviewError('Kunne ikke hente preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!url.trim()) {
      setPreview(null);
      setPreviewError(null);
      setLoadingPreview(false);
      setLastFetchedUrl(null);
      return;
    }

    if (!normalizedUrl) {
      setPreview(null);
      setPreviewError('Ugyldig URL. Brug http:// eller https://');
      setLoadingPreview(false);
      return;
    }

    setPreviewError(null);

    const timer = setTimeout(() => {
      handleFetchPreview(normalizedUrl);
    }, 800);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

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
        note: body.trim() || undefined,
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

      logger.log('[NewsComposer] Publishing news with actor:', actor.type);

      await insertNewsItem(newsData);

      logger.log('[NewsComposer] News published successfully');

      // Reset form
      setUrl('');
      setBody('');
      setPreview(null);
      setPreviewError(null);
      setLastFetchedUrl(null);
      onSuccess();
    } catch (error: any) {
      logger.error('[NewsComposer] Publish error:', {
        code: error?.code,
        message: error?.message,
        kind: error?.kind,
      });

      // Handle duplicate URL error
      if (error?.kind === 'DUPLICATE_URL') {
        logger.warn('[NewsComposer] Duplicate URL detected');
        alert(
          'Linket findes allerede\n\nDet link er allerede delt i appen. Et link kan kun oprettes én gang.\n\nTip: Find nyheden i feedet og kommentér i stedet på opslaget.',
        );
        // Focus URL input so user can easily replace it
        requestAnimationFrame(() => {
          urlInputRef.current?.focus();
        });
      } else {
        const errorMsg = error?.message || 'Kunne ikke dele nyhed';
        logger.error('[NewsComposer] General publish error:', errorMsg);
        alert('Kunne ikke dele nyhed: ' + errorMsg);
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={theme.spacing[8]}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: theme.spacing[16] + keyboardHeight,
        }}
      >
        <View style={styles.container}>
          <Card style={styles.sectionCard}>
            <View style={styles.bodySection}>
              <Text style={styles.label}>Tekst (valgfrit)</Text>
              <TextInput
                ref={bodyInputRef}
                style={[styles.input, styles.bodyInput]}
                placeholder="Tilføj brødtekst til nyheden..."
                placeholderTextColor={theme.colors.text.secondary}
                value={body}
                onChangeText={setBody}
                onEndEditing={handleBodyEndEditing}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <Text style={styles.label}>Link URL</Text>
            <TextInput
              ref={urlInputRef}
              style={styles.input}
              placeholder="https://example.com/article"
              placeholderTextColor={theme.colors.text.secondary}
              value={url}
              onChangeText={setUrl}
              onFocus={() => scrollToInput(urlInputRef)}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
              clearButtonMode="while-editing"
              editable={!publishing}
            />

            {showPreviewSuccess ? (
              <View style={styles.statusRow}>
                <Text style={styles.successText}>Preview klar</Text>
              </View>
            ) : null}

            {loadingPreview ? (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={newsAccent} />
                <Text style={styles.statusText}>Henter preview...</Text>
              </View>
            ) : null}

            {!loadingPreview && previewError ? (
              <View style={styles.statusRow}>
                <Text style={styles.errorText}>Kunne ikke hente preview</Text>
                {normalizedUrl ? (
                  <Pressable onPress={() => handleFetchPreview(normalizedUrl, true)}>
                    <Text style={styles.retryText}>Prøv igen</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Card>

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

          <View
            style={[
              styles.submitButtonWrap,
              !preview || publishing || (!preview?.title && !preview?.description)
                ? styles.submitButtonWrapDisabled
                : null,
            ]}
          >
            <View style={styles.submitButtonInner}>
              <PrimaryButton
                title={publishing ? 'Deler...' : 'Del nyhed'}
                onPress={handlePublish}
                disabled={!preview || publishing || (!preview?.title && !preview?.description)}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    keyboardContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: theme.spacing[16],
    },
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
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    input: {
      padding: theme.spacing[4],
      backgroundColor: theme.colors.bg.subtle,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      fontSize: 15,
      color: theme.colors.text.primary,
    },
    bodyInput: {
      minHeight: 148,
    },
    bodySection: {
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      marginTop: theme.spacing[1],
    },
    statusText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
    },
    successText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.state.success,
      fontWeight: '600',
    },
    errorText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
    },
    retryText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.state.success,
      fontWeight: '600',
    },
    previewCard: {
      padding: theme.spacing[0],
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
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
      color: theme.colors.state.success,
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
    submitButtonWrap: {
      marginTop: theme.spacing[1],
      padding: theme.spacing[2],
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    submitButtonWrapDisabled: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.border.default,
      opacity: 1,
    },
    submitButtonInner: {
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: theme.colors.pill.green.border,
      padding: theme.spacing[1],
    },
  });
}
