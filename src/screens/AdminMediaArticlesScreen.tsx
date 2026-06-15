import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  MediaArticleCandidateCard,
  type MediaArticleCandidateDraft,
} from '../components/MediaArticleCandidateCard';
import { Card, Chip, SegmentedControl, Text } from '../components/ui';
import { logger } from '../lib/logger';
import {
  approveMediaArticleCandidate,
  deleteMediaArticlePost,
  listMediaArticleCandidates,
  listMediaArticlePosts,
  runMediaArticleCandidateIngestion,
  updateMediaArticleCandidate,
  updateMediaArticlePost,
} from '../services/mediaArticleApi';
import { useFeed } from '../state/FeedContext';
import { type Theme, useTheme } from '../theme';
import { canAccessMediaArticleAdmin, type MediaArticleAdminItem } from '../utils/mediaArticleAdmin';
import {
  type MediaArticleCandidateItem,
  type MediaArticleCandidateStatus,
} from '../utils/mediaArticleCandidates';
import { describeMediaArticleApprovalError } from '../utils/mediaArticleApprovalError';
import {
  ALL_MEDIA_ARTICLE_SOURCES,
  DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS,
  filterMediaArticleCandidates,
  getMediaArticleCandidateSourceNames,
  getMediaArticleCandidateStatusCounts,
  type MediaArticleCandidateSort,
} from '../utils/mediaArticleCandidateList';

type EditDraft = {
  caption: string;
  title: string;
  description: string;
};

type AdminMediaListItem =
  | { id: string; kind: 'candidate'; candidate: MediaArticleCandidateItem }
  | { id: string; kind: 'article'; article: MediaArticleAdminItem };

const STATUS_TAB_LABELS: Record<MediaArticleCandidateStatus, string> = {
  pending: 'Til gennemgang',
  approved: 'Publiceret',
  ignored: 'Ignoreret',
  rejected: 'Afvist',
};

const EMPTY_STATE_LABELS: Record<MediaArticleCandidateStatus, string> = {
  pending: 'Ingen kandidater til gennemgang',
  approved: 'Ingen publicerede artikler',
  ignored: 'Ingen ignorerede kandidater',
  rejected: 'Ingen afviste kandidater',
};

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatCreatedAt(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return dateIso || 'Ukendt dato';
  }

  return date.toLocaleString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminMediaArticlesScreen() {
  const navigation = useNavigation();
  const { isAppAdmin } = useAuth();
  const { fetchPosts } = useFeed();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasAccess = canAccessMediaArticleAdmin(isAppAdmin);

  const [candidates, setCandidates] = useState<MediaArticleCandidateItem[]>([]);
  const [articles, setArticles] = useState<MediaArticleAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [candidateBusyId, setCandidateBusyId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<MediaArticleCandidateStatus>(
    DEFAULT_MEDIA_ARTICLE_CANDIDATE_STATUS,
  );
  const [sourceFilter, setSourceFilter] = useState(ALL_MEDIA_ARTICLE_SOURCES);
  const [candidateSort, setCandidateSort] = useState<MediaArticleCandidateSort>('newest');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadArticles = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!hasAccess) {
        setLoading(false);
        return;
      }

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [candidateItems, articleItems] = await Promise.all([
          listMediaArticleCandidates(),
          listMediaArticlePosts(),
        ]);
        setCandidates(candidateItems);
        setArticles(articleItems);
      } catch (error) {
        logger.error('[AdminMediaArticles] List failed:', error);
        Alert.alert('Kunne ikke hente artikler', 'Prøv igen om lidt.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hasAccess],
  );

  const statusCounts = useMemo(
    () => getMediaArticleCandidateStatusCounts(candidates),
    [candidates],
  );
  const sourceNames = useMemo(() => getMediaArticleCandidateSourceNames(candidates), [candidates]);
  const statusTabs = useMemo(
    () =>
      (['pending', 'approved', 'ignored', 'rejected'] as const).map((status) => ({
        key: status,
        label: `${STATUS_TAB_LABELS[status]} (${
          status === 'approved' ? articles.length : statusCounts[status]
        })`,
      })),
    [articles.length, statusCounts],
  );
  const filteredCandidates = useMemo(
    () =>
      filterMediaArticleCandidates(candidates, {
        status: activeStatus,
        sourceName: sourceFilter,
        sort: candidateSort,
      }),
    [activeStatus, candidateSort, candidates, sourceFilter],
  );
  const filteredArticles = useMemo(() => {
    const relevanceByPostId = new Map(
      candidates.flatMap((candidate) =>
        candidate.publishedPostId
          ? [[candidate.publishedPostId, candidate.relevanceScore] as const]
          : [],
      ),
    );

    return articles
      .filter(
        (article) =>
          sourceFilter === ALL_MEDIA_ARTICLE_SOURCES || article.sourceName === sourceFilter,
      )
      .sort((left, right) => {
        if (candidateSort === 'relevance') {
          const relevanceDifference =
            (relevanceByPostId.get(right.id) ?? 0) - (relevanceByPostId.get(left.id) ?? 0);
          if (relevanceDifference !== 0) {
            return relevanceDifference;
          }
        }

        return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
      });
  }, [articles, candidateSort, candidates, sourceFilter]);
  const listItems = useMemo<AdminMediaListItem[]>(
    () =>
      activeStatus === 'approved'
        ? filteredArticles.map(
            (article): AdminMediaListItem => ({
              id: `article:${article.id}`,
              kind: 'article',
              article,
            }),
          )
        : filteredCandidates.map(
            (candidate): AdminMediaListItem => ({
              id: `candidate:${candidate.id}`,
              kind: 'candidate',
              candidate,
            }),
          ),
    [activeStatus, filteredArticles, filteredCandidates],
  );

  useEffect(() => {
    if (sourceFilter !== ALL_MEDIA_ARTICLE_SOURCES && !sourceNames.includes(sourceFilter)) {
      setSourceFilter(ALL_MEDIA_ARTICLE_SOURCES);
    }
  }, [sourceFilter, sourceNames]);

  useFocusEffect(
    useCallback(() => {
      void loadArticles();
    }, [loadArticles]),
  );

  const replaceCandidate = (updated: MediaArticleCandidateItem) => {
    setCandidates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleRunIngestion = async () => {
    setIngesting(true);
    try {
      const result = await runMediaArticleCandidateIngestion();
      setCandidates(await listMediaArticleCandidates());
      Alert.alert(
        'Kildetjek færdigt',
        [
          `${result.inserted} nye kandidater`,
          `${result.duplicates} dubletter sprunget over`,
          `${result.rejected} ikke relevante`,
          result.errors > 0 ? `${result.errors} kildefejl` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      logger.error('[AdminMediaArticles] Candidate ingestion failed:', error);
      Alert.alert(
        'Kunne ikke hente kandidater',
        'Ingen artikler blev publiceret. Prøv igen om lidt.',
      );
    } finally {
      setIngesting(false);
    }
  };

  const handleCandidateSave = async (
    candidate: MediaArticleCandidateItem,
    draft: MediaArticleCandidateDraft,
  ) => {
    setCandidateBusyId(candidate.id);
    try {
      replaceCandidate(
        await updateMediaArticleCandidate({
          id: candidate.id,
          ...draft,
        }),
      );
    } catch (error) {
      logger.error('[AdminMediaArticles] Candidate update failed:', error);
      Alert.alert('Kunne ikke gemme', 'Kandidaten blev ikke opdateret.');
      throw error;
    } finally {
      setCandidateBusyId(null);
    }
  };

  const handleCandidateStatusChange = async (
    candidate: MediaArticleCandidateItem,
    status: Exclude<MediaArticleCandidateStatus, 'approved'>,
  ) => {
    setCandidateBusyId(candidate.id);
    try {
      replaceCandidate(
        await updateMediaArticleCandidate({
          id: candidate.id,
          sourceName: candidate.sourceName,
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          description: candidate.description,
          imageUrl: candidate.imageUrl,
          caption: candidate.caption,
          status,
        }),
      );
    } catch (error) {
      logger.error('[AdminMediaArticles] Candidate status failed:', error);
      Alert.alert('Kunne ikke opdatere status', 'Prøv igen om lidt.');
    } finally {
      setCandidateBusyId(null);
    }
  };

  const handleCandidateApprove = (candidate: MediaArticleCandidateItem) => {
    Alert.alert(
      'Publicér artikel',
      `"${candidate.title}" oprettes som et normalt opslag i FCN i medierne.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Publicér',
          onPress: async () => {
            setCandidateBusyId(candidate.id);
            try {
              await approveMediaArticleCandidate(candidate.id);
              const [candidateItems, articleItems] = await Promise.all([
                listMediaArticleCandidates(),
                listMediaArticlePosts(),
              ]);
              setCandidates(candidateItems);
              setArticles(articleItems);
              void fetchPosts();
            } catch (error) {
              const diagnostic = describeMediaArticleApprovalError(error);
              logger.error('[AdminMediaArticles][CandidateApproval]', {
                candidateId: candidate.id,
                candidateStatus: candidate.status,
                canonicalUrl: candidate.canonicalUrl,
                ...diagnostic,
                rawError: error,
              });
              Alert.alert(
                'Kunne ikke publicere',
                __DEV__
                  ? `${diagnostic.debugMessage}\n\nKandidaten er stadig afventende.`
                  : `${diagnostic.summary} Artiklen blev i gennemgangen.`,
              );
            } finally {
              setCandidateBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handleOpenCandidate = async (candidate: MediaArticleCandidateItem) => {
    try {
      await Linking.openURL(candidate.canonicalUrl);
    } catch (error) {
      logger.warn('[AdminMediaArticles] Open candidate URL failed:', {
        url: candidate.canonicalUrl,
        error,
      });
      Alert.alert('Kunne ikke åbne linket', candidate.canonicalUrl);
    }
  };

  const startEditing = (article: MediaArticleAdminItem) => {
    setEditingId(article.id);
    setEditDraft({
      caption: article.caption,
      title: article.linkPreview.title ?? '',
      description: article.linkPreview.description ?? '',
    });
  };

  const stopEditing = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleSave = async (article: MediaArticleAdminItem) => {
    if (!editDraft) {
      return;
    }

    setSavingId(article.id);
    try {
      const updated = await updateMediaArticlePost({
        id: article.id,
        caption: editDraft.caption,
        title: editDraft.title,
        description: editDraft.description,
        linkPreview: article.linkPreview,
      });

      setArticles((current) => current.map((item) => (item.id === article.id ? updated : item)));
      stopEditing();
      void fetchPosts();
    } catch (error) {
      logger.error('[AdminMediaArticles] Update failed:', error);
      Alert.alert('Kunne ikke gemme', 'Artiklen blev ikke opdateret.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = (article: MediaArticleAdminItem) => {
    Alert.alert('Slet artikel', `Vil du slette "${article.title}" fra feedet?`, [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(article.id);
          try {
            await deleteMediaArticlePost(article.id);
            setArticles((current) => current.filter((item) => item.id !== article.id));
            if (editingId === article.id) {
              stopEditing();
            }
            void fetchPosts();
          } catch (error) {
            logger.error('[AdminMediaArticles] Delete failed:', error);
            Alert.alert('Kunne ikke slette', 'Artiklen blev ikke slettet.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const handleOpenArticle = async (article: MediaArticleAdminItem) => {
    try {
      await Linking.openURL(article.url);
    } catch (error) {
      logger.warn('[AdminMediaArticles] Open URL failed:', {
        url: article.url,
        error,
      });
      Alert.alert('Kunne ikke åbne linket', article.url);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.headerButton}
        accessibilityRole="button"
        accessibilityLabel="Gå tilbage"
      >
        <Ionicons
          name="arrow-back"
          size={theme.components.icon.size.md}
          color={theme.colors.text.primary}
        />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text variant="h3" style={styles.headerTitle}>
          FCN i medierne
        </Text>
        <Text variant="caption" color="secondary">
          Administrér importerede artikler
        </Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centered}>
          <Text variant="body" color="secondary">
            Kun app admins har adgang.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadArticles('refresh')}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Card style={styles.ingestionCard}>
                <View style={styles.ingestionCopy}>
                  <Text variant="bodyBold">Find nye artikler</Text>
                  <Text variant="caption" color="secondary">
                    Tjek de valgte medier. Fund gemmes kun til admin-gennemgang.
                  </Text>
                </View>
                <Pressable
                  style={[styles.ingestionButton, ingesting && styles.disabledButton]}
                  onPress={() => void handleRunIngestion()}
                  disabled={ingesting}
                >
                  {ingesting ? (
                    <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                  ) : (
                    <Ionicons
                      name="refresh"
                      size={theme.components.icon.size.sm}
                      color={theme.colors.text.inverse}
                    />
                  )}
                  <Text variant="small" color="inverse">
                    {ingesting ? 'Henter…' : 'Hent kandidater'}
                  </Text>
                </Pressable>
              </Card>

              <SegmentedControl
                items={statusTabs}
                activeKey={activeStatus}
                onChange={setActiveStatus}
              />

              <View style={styles.filterGroup}>
                <Text variant="caption" color="secondary">
                  Kilde
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  <Chip
                    label="Alle kilder"
                    selected={sourceFilter === ALL_MEDIA_ARTICLE_SOURCES}
                    onPress={() => setSourceFilter(ALL_MEDIA_ARTICLE_SOURCES)}
                  />
                  {sourceNames.map((sourceName) => (
                    <Chip
                      key={sourceName}
                      label={sourceName}
                      selected={sourceFilter === sourceName}
                      onPress={() => setSourceFilter(sourceName)}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.filterGroup}>
                <Text variant="caption" color="secondary">
                  Sortering
                </Text>
                <View style={styles.filterRow}>
                  <Chip
                    label="Nyeste først"
                    selected={candidateSort === 'newest'}
                    onPress={() => setCandidateSort('newest')}
                  />
                  <Chip
                    label="Højeste relevans først"
                    selected={candidateSort === 'relevance'}
                    onPress={() => setCandidateSort('relevance')}
                  />
                </View>
              </View>

              <View style={styles.resultSummary}>
                <Text variant="bodyBold">{STATUS_TAB_LABELS[activeStatus]}</Text>
                <Text variant="caption" color="secondary">
                  {listItems.length}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="bodyBold">{EMPTY_STATE_LABELS[activeStatus]}</Text>
              {sourceFilter !== ALL_MEDIA_ARTICLE_SOURCES ? (
                <Text variant="caption" color="secondary">
                  Ingen resultater fra {sourceFilter}
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item: listItem }) => {
            if (listItem.kind === 'candidate') {
              return (
                <MediaArticleCandidateCard
                  candidate={listItem.candidate}
                  busy={candidateBusyId === listItem.candidate.id}
                  onOpen={(candidate) => void handleOpenCandidate(candidate)}
                  onSave={handleCandidateSave}
                  onApprove={handleCandidateApprove}
                  onStatusChange={(candidate, status) =>
                    void handleCandidateStatusChange(candidate, status)
                  }
                />
              );
            }

            const item = listItem.article;
            const isEditing = editingId === item.id && editDraft !== null;
            const isSaving = savingId === item.id;
            const isDeleting = deletingId === item.id;
            const isBusy = isSaving || isDeleting;

            return (
              <Card style={styles.articleCard}>
                <View style={styles.articleHeader}>
                  <View style={styles.articleHeaderCopy}>
                    <Text variant="bodyBold">{item.sourceName}</Text>
                    <Text variant="caption" color="secondary">
                      {formatCreatedAt(item.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text variant="small" color="success">
                      {item.statusLabel}
                    </Text>
                  </View>
                </View>

                {isEditing && editDraft ? (
                  <View style={styles.editFields}>
                    <Text variant="caption" color="secondary">
                      Titel
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={editDraft.title}
                      onChangeText={(title) =>
                        setEditDraft((current) => (current ? { ...current, title } : current))
                      }
                      editable={!isBusy}
                    />

                    <Text variant="caption" color="secondary">
                      Beskrivelse
                    </Text>
                    <TextInput
                      style={[styles.input, styles.multilineInput]}
                      value={editDraft.description}
                      onChangeText={(description) =>
                        setEditDraft((current) => (current ? { ...current, description } : current))
                      }
                      multiline
                      textAlignVertical="top"
                      editable={!isBusy}
                    />

                    <Text variant="caption" color="secondary">
                      Caption
                    </Text>
                    <TextInput
                      style={[styles.input, styles.multilineInput]}
                      value={editDraft.caption}
                      onChangeText={(caption) =>
                        setEditDraft((current) => (current ? { ...current, caption } : current))
                      }
                      multiline
                      textAlignVertical="top"
                      editable={!isBusy}
                    />
                  </View>
                ) : (
                  <>
                    <Text variant="bodyBold" style={styles.articleTitle}>
                      {item.title}
                    </Text>
                    {item.caption ? (
                      <Text variant="body" color="secondary" style={styles.caption}>
                        {item.caption}
                      </Text>
                    ) : null}
                  </>
                )}

                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {item.domain}
                </Text>
                <Text variant="small" color="muted" numberOfLines={2}>
                  {item.url}
                </Text>

                <View style={styles.actionRow}>
                  {isEditing ? (
                    <>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton]}
                        onPress={stopEditing}
                        disabled={isBusy}
                      >
                        <Text variant="small" color="secondary">
                          Annuller
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.primaryButton]}
                        onPress={() => void handleSave(item)}
                        disabled={isBusy}
                      >
                        {isSaving ? (
                          <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                        ) : (
                          <Text variant="small" color="inverse">
                            Gem
                          </Text>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton]}
                        onPress={() => void handleOpenArticle(item)}
                        disabled={isBusy}
                      >
                        <Text variant="small" color="secondary">
                          Åbn
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.secondaryButton]}
                        onPress={() => startEditing(item)}
                        disabled={isBusy}
                      >
                        <Text variant="small" color="secondary">
                          Redigér
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDelete(item)}
                        disabled={isBusy}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={theme.colors.error} />
                        ) : (
                          <Text variant="small" color="error">
                            Slet
                          </Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    headerButton: {
      padding: theme.spacing[1],
    },
    headerCopy: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      textAlign: 'center',
    },
    headerSpacer: {
      width: theme.components.icon.size.md + theme.spacing[2],
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing[4],
    },
    listContent: {
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    listHeader: {
      gap: theme.spacing[3],
    },
    ingestionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    ingestionCopy: {
      flex: 1,
      gap: theme.spacing[1],
    },
    ingestionButton: {
      minHeight: theme.spacing[10],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.primary,
    },
    disabledButton: {
      opacity: 0.55,
    },
    filterGroup: {
      gap: theme.spacing[2],
    },
    filterRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      paddingRight: theme.spacing[4],
    },
    resultSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: theme.spacing[1],
    },
    emptyState: {
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[12],
    },
    articleCard: {
      gap: theme.spacing[2],
    },
    articleHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    articleHeaderCopy: {
      flex: 1,
      gap: theme.spacing[1],
    },
    statusBadge: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.pill.green.bg,
    },
    articleTitle: {
      marginTop: theme.spacing[1],
    },
    caption: {
      marginTop: theme.spacing[1],
    },
    editFields: {
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    input: {
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
      color: theme.colors.text.primary,
      ...theme.typography.body,
    },
    multilineInput: {
      minHeight: theme.spacing[16],
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    actionButton: {
      flex: 1,
      minHeight: theme.spacing[9],
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.md,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
    },
    secondaryButton: {
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    deleteButton: {
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.error,
      backgroundColor: theme.colors.bg.card,
    },
  });
}
