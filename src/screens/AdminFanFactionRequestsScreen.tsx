import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { Card, Text } from '../components/ui';
import { logger } from '../lib/logger';
import {
  approveRequest,
  listPendingRequests,
  PendingFanFactionRequestItem,
  rejectRequest,
} from '../services/communityFanFactionRequests';
import { useTheme } from '../theme';

function formatCreatedAt(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminFanFactionRequestsScreen() {
  const navigation = useNavigation();
  const { isAppAdmin } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PendingFanFactionRequestItem[]>([]);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPendingRequests();
      setRequests(data);
    } catch (error) {
      logger.error('[AdminFanFactionRequests] Error loading requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isAppAdmin) return;
      loadRequests();
    }, [isAppAdmin, loadRequests]),
  );

  const handleApprove = async (requestId: string) => {
    setActingRequestId(requestId);
    try {
      const success = await approveRequest(requestId);
      if (!success) return;
      setRequests((prev) => prev.filter((request) => request.id !== requestId));
    } catch (error) {
      logger.error('[AdminFanFactionRequests] Approve failed:', error);
    } finally {
      setActingRequestId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActingRequestId(requestId);
    try {
      const success = await rejectRequest(requestId);
      if (!success) return;
      setRequests((prev) => prev.filter((request) => request.id !== requestId));
    } catch (error) {
      logger.error('[AdminFanFactionRequests] Reject failed:', error);
    } finally {
      setActingRequestId(null);
    }
  };

  if (!isAppAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
          </Pressable>
          <Text variant="h3" style={styles.headerTitle}>
            Fanfraktion-anmodninger
          </Text>
          <View style={styles.headerSpacer} />
        </View>
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
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
        </Pressable>
        <Text variant="h3" style={styles.headerTitle}>
          Fanfraktion-anmodninger
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="body" color="secondary">
            Ingen afventende anmodninger
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isActing = actingRequestId === item.id;
            const requesterLabel = item.requested_by_name || item.requested_by;

            return (
              <Card style={styles.requestCard}>
                <Text variant="bodyBold" style={styles.requestTitle}>
                  {item.community_name}
                </Text>

                {item.community_location_label ? (
                  <Text variant="caption" color="secondary" style={styles.requestMeta}>
                    Område: {item.community_location_label}
                  </Text>
                ) : null}

                <Text variant="caption" color="secondary" style={styles.requestMeta}>
                  Anmodet af: {requesterLabel}
                </Text>

                <Text variant="caption" color="secondary" style={styles.requestMeta}>
                  Dato: {formatCreatedAt(item.created_at)}
                </Text>

                {item.note ? (
                  <View style={styles.noteBox}>
                    <Text variant="small" color="secondary">
                      {item.note}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionButton, styles.rejectButton, isActing && styles.disabledButton]}
                    onPress={() => handleReject(item.id)}
                    disabled={isActing}
                  >
                    <Text variant="small" style={styles.rejectButtonText}>
                      Afvis
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionButton, styles.approveButton, isActing && styles.disabledButton]}
                    onPress={() => handleApprove(item.id)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                    ) : (
                      <Text variant="small" style={styles.approveButtonText}>
                        Godkend
                      </Text>
                    )}
                  </Pressable>
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    headerBackButton: {
      padding: theme.spacing[1],
    },
    headerTitle: {
      textAlign: 'center',
    },
    headerSpacer: {
      width: theme.spacing[8],
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[4],
    },
    listContent: {
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    requestCard: {
      padding: theme.spacing[4],
      gap: theme.spacing[1],
    },
    requestTitle: {
      color: theme.colors.text.primary,
    },
    requestMeta: {
      marginTop: theme.spacing[0],
    },
    noteBox: {
      marginTop: theme.spacing[2],
      padding: theme.spacing[3],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.elevated,
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing[2],
      marginTop: theme.spacing[3],
    },
    actionButton: {
      flex: 1,
      minHeight: theme.spacing[9],
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
    },
    approveButton: {
      backgroundColor: theme.colors.primary,
    },
    rejectButton: {
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    approveButtonText: {
      color: theme.colors.text.inverse,
      fontWeight: '600',
    },
    rejectButtonText: {
      color: theme.colors.text.secondary,
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.6,
    },
  });
