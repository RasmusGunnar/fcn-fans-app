import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { type Theme, useTheme } from '../theme';
import {
  canApproveMediaArticleCandidate,
  type MediaArticleCandidateItem,
  type MediaArticleCandidateStatus,
} from '../utils/mediaArticleCandidates';
import { Card, Text } from './ui';

export type MediaArticleCandidateDraft = {
  sourceName: string;
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  caption: string;
};

type Props = {
  candidate: MediaArticleCandidateItem;
  busy: boolean;
  onOpen: (candidate: MediaArticleCandidateItem) => void;
  onSave: (
    candidate: MediaArticleCandidateItem,
    draft: MediaArticleCandidateDraft,
  ) => Promise<void>;
  onApprove: (candidate: MediaArticleCandidateItem) => void;
  onStatusChange: (
    candidate: MediaArticleCandidateItem,
    status: Exclude<MediaArticleCandidateStatus, 'approved'>,
  ) => void;
};

function createDraft(candidate: MediaArticleCandidateItem): MediaArticleCandidateDraft {
  return {
    sourceName: candidate.sourceName,
    canonicalUrl: candidate.canonicalUrl,
    title: candidate.title,
    description: candidate.description,
    imageUrl: candidate.imageUrl,
    caption: candidate.caption,
  };
}

function formatDate(dateIso: string | null): string {
  const date = new Date(dateIso ?? '');
  if (Number.isNaN(date.getTime())) {
    return 'Ukendt dato';
  }

  return date.toLocaleString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MediaArticleCandidateCard({
  candidate,
  busy,
  onOpen,
  onSave,
  onApprove,
  onStatusChange,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(candidate));

  useEffect(() => {
    if (!editing) {
      setDraft(createDraft(candidate));
    }
  }, [candidate, editing]);

  const setDraftField = (field: keyof MediaArticleCandidateDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const cancelEditing = () => {
    setDraft(createDraft(candidate));
    setEditing(false);
  };

  const save = async () => {
    try {
      await onSave(candidate, draft);
      setEditing(false);
    } catch {
      // The parent presents the error; keep the fields open for correction.
    }
  };

  const canEdit = candidate.status !== 'approved';
  const canApprove = canApproveMediaArticleCandidate(candidate);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="bodyBold">{candidate.sourceName}</Text>
          <Text variant="caption" color="secondary">
            {formatDate(candidate.publishedAt ?? candidate.createdAt)}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            candidate.status === 'pending'
              ? styles.pendingBadge
              : candidate.status === 'approved'
                ? styles.approvedBadge
                : styles.inactiveBadge,
          ]}
        >
          <Text variant="small">{candidate.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text variant="small" color="secondary">
          Relevans {candidate.relevanceScore}/100
        </Text>
        {candidate.detectedKeywords.length > 0 ? (
          <Text variant="small" color="muted" numberOfLines={1}>
            {candidate.detectedKeywords.join(' · ')}
          </Text>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editFields}>
          <Field
            label="Kilde"
            value={draft.sourceName}
            onChangeText={(value) => setDraftField('sourceName', value)}
            editable={!busy}
            styles={styles}
          />
          <Field
            label="Artikel-URL"
            value={draft.canonicalUrl}
            onChangeText={(value) => setDraftField('canonicalUrl', value)}
            editable={!busy}
            autoCapitalize="none"
            styles={styles}
          />
          <Field
            label="Titel"
            value={draft.title}
            onChangeText={(value) => setDraftField('title', value)}
            editable={!busy}
            styles={styles}
          />
          <Field
            label="Beskrivelse"
            value={draft.description}
            onChangeText={(value) => setDraftField('description', value)}
            editable={!busy}
            multiline
            styles={styles}
          />
          <Field
            label="Caption"
            value={draft.caption}
            onChangeText={(value) => setDraftField('caption', value)}
            editable={!busy}
            multiline
            styles={styles}
          />
          <Field
            label="Billede-URL"
            value={draft.imageUrl}
            onChangeText={(value) => setDraftField('imageUrl', value)}
            editable={!busy}
            autoCapitalize="none"
            styles={styles}
          />
        </View>
      ) : (
        <>
          <Text variant="bodyBold" style={styles.title}>
            {candidate.title}
          </Text>
          {candidate.description ? (
            <Text variant="body" color="secondary" numberOfLines={3} style={styles.description}>
              {candidate.description}
            </Text>
          ) : null}
          {candidate.caption ? (
            <Text variant="caption" color="secondary">
              Caption: {candidate.caption}
            </Text>
          ) : null}
        </>
      )}

      <Text variant="caption" color="secondary" numberOfLines={1}>
        {candidate.domain}
      </Text>
      <Text variant="small" color="muted" numberOfLines={2}>
        {candidate.canonicalUrl}
      </Text>

      <View style={styles.actionRow}>
        {editing ? (
          <>
            <ActionButton
              label="Annuller"
              onPress={cancelEditing}
              disabled={busy}
              styles={styles}
            />
            <ActionButton
              label="Gem"
              onPress={() => void save()}
              disabled={busy}
              primary
              loading={busy}
              styles={styles}
            />
          </>
        ) : (
          <>
            <ActionButton
              label="Åbn"
              icon="open-outline"
              onPress={() => onOpen(candidate)}
              disabled={busy}
              styles={styles}
            />
            {canEdit ? (
              <ActionButton
                label="Redigér"
                onPress={() => setEditing(true)}
                disabled={busy}
                styles={styles}
              />
            ) : null}
            {canApprove ? (
              <ActionButton
                label="Publicér"
                onPress={() => onApprove(candidate)}
                disabled={busy}
                primary
                loading={busy}
                styles={styles}
              />
            ) : null}
          </>
        )}
      </View>

      {!editing && candidate.status !== 'approved' ? (
        <View style={styles.secondaryActionRow}>
          {candidate.status === 'pending' ? (
            <>
              <ActionButton
                label="Afvis"
                onPress={() => onStatusChange(candidate, 'rejected')}
                disabled={busy}
                styles={styles}
              />
              <ActionButton
                label="Ignorér"
                onPress={() => onStatusChange(candidate, 'ignored')}
                disabled={busy}
                styles={styles}
              />
            </>
          ) : (
            <ActionButton
              label="Flyt til gennemgang"
              onPress={() => onStatusChange(candidate, 'pending')}
              disabled={busy}
              styles={styles}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  styles: ReturnType<typeof createStyles>;
};

function Field({
  label,
  value,
  onChangeText,
  editable,
  multiline = false,
  autoCapitalize = 'sentences',
  styles,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

type ActionButtonProps = {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  loading?: boolean;
  styles: ReturnType<typeof createStyles>;
};

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  primary = false,
  loading = false,
  styles,
}: ActionButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      style={[
        styles.actionButton,
        primary ? styles.primaryButton : styles.secondaryButton,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? theme.colors.text.inverse : theme.colors.primary}
        />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={theme.components.icon.size.sm}
              color={primary ? theme.colors.text.inverse : theme.colors.text.secondary}
            />
          ) : null}
          <Text variant="small" color={primary ? 'inverse' : 'secondary'}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      gap: theme.spacing[2],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    headerCopy: {
      flex: 1,
      gap: theme.spacing[1],
    },
    statusBadge: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1],
      borderRadius: theme.radius.pill,
    },
    pendingBadge: {
      backgroundColor: theme.colors.pill.orange.bg,
    },
    approvedBadge: {
      backgroundColor: theme.colors.pill.green.bg,
    },
    inactiveBadge: {
      backgroundColor: theme.colors.pill.neutral.bg,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[2],
    },
    title: {
      marginTop: theme.spacing[1],
    },
    description: {
      marginTop: theme.spacing[1],
    },
    editFields: {
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    field: {
      gap: theme.spacing[1],
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
      flexWrap: 'wrap',
      gap: theme.spacing[2],
      marginTop: theme.spacing[2],
    },
    secondaryActionRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
    },
    actionButton: {
      flex: 1,
      minWidth: theme.spacing[16],
      minHeight: theme.spacing[9],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[1],
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
    disabledButton: {
      opacity: 0.55,
    },
  });
}
