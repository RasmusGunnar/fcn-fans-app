import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { logger } from '../lib/logger';
import { useAuth } from '../auth/AuthProvider';
import { listMembers, CommunityMember, setMemberRole } from '../services/communities';
import { resolveAvatarUrl } from '../utils/avatar';

type CommunityMembersRouteProp = RouteProp<
  { CommunityMembers: { communityId: string; title: string; communityType: 'community' | 'fan_faction' } },
  'CommunityMembers'
>;

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

function roleLabelDa(role: string): string {
  switch (role) {
    case 'owner':
      return 'Ejer';
    case 'admin':
      return 'Admin';
    default:
      return 'Medlem';
  }
}

export default function CommunityMembersScreen() {
  const navigation = useNavigation();
  const route = useRoute<CommunityMembersRouteProp>();
  const { communityId, title, communityType } = route.params;
  const theme = useTheme();
  const { user } = useAuth();

  const accentColor =
    communityType === 'fan_faction' ? theme.colors.primary : theme.colors.state.info;

  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listMembers(communityId);
        // Sort: owner → admin → member, then alphabetically
        data.sort((a, b) => {
          const ra = ROLE_ORDER[a.role] ?? 9;
          const rb = ROLE_ORDER[b.role] ?? 9;
          if (ra !== rb) return ra - rb;
          const na = (a.display_name ?? '').toLowerCase();
          const nb = (b.display_name ?? '').toLowerCase();
          return na.localeCompare(nb);
        });
        setMembers(data);
      } catch (err: any) {
        logger.warn('[CommunityMembers] Error:', err?.code || err);
        setError('Kunne ikke hente medlemmer. Prøv igen senere.');
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId]);

  const handleToggleRole = async (member: CommunityMember) => {
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    const actionText = newRole === 'admin' ? 'Gør til admin' : 'Fjern admin';
    
    Alert.alert(
      actionText,
      `Er du sikker på at du vil ${newRole === 'admin' ? 'gøre' : 'fjerne'} ${member.display_name || 'denne bruger'} ${newRole === 'admin' ? 'til admin' : 'som admin'}?`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Bekræft',
          onPress: async () => {
            setUpdatingUserId(member.user_id);
            try {
              const success = await setMemberRole(communityId, member.user_id, newRole);
              if (success) {
                // Update local state
                setMembers((prev) =>
                  prev.map((m) =>
                    m.user_id === member.user_id ? { ...m, role: newRole } : m
                  )
                );
                Alert.alert('Succes', `Rolle opdateret til ${roleLabelDa(newRole)}`);
              } else {
                Alert.alert('Fejl', 'Kunne ikke opdatere rolle. Prøv igen.');
              }
            } catch (error) {
              logger.error('[CommunityMembers] Error updating role:', error);
              Alert.alert('Fejl', 'Kunne ikke opdatere rolle. Prøv igen.');
            } finally {
              setUpdatingUserId(null);
            }
          },
        },
      ]
    );
  };

  const currentUserIsOwner = members.find((m) => m.user_id === user?.id)?.role === 'owner';

  const styles = makeStyles(theme, accentColor);

  const renderItem = ({ item }: { item: CommunityMember }) => {
    const avatarUri = resolveAvatarUrl(item.avatar_url);
    const displayName = item.display_name || 'Ukendt bruger';
    const showBadge = item.role === 'owner' || item.role === 'admin';
    const canChangeRole = currentUserIsOwner && item.role !== 'owner';
    const isUpdating = updatingUserId === item.user_id;

    return (
      <View style={styles.memberRow}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={theme.components.icon.size.sm} color={theme.colors.text.secondary} />
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>
            {displayName}
          </Text>
          {showBadge && (
            <View style={[styles.roleBadge, { backgroundColor: accentColor }]}>
              <Text style={styles.roleBadgeText}>{roleLabelDa(item.role)}</Text>
            </View>
          )}
        </View>
        {canChangeRole && (
          <Pressable
            onPress={() => handleToggleRole(item)}
            disabled={isUpdating}
            style={styles.roleActionButton}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : (
              <>
                <Ionicons
                  name={item.role === 'admin' ? 'remove-circle-outline' : 'person-add-outline'}
                  size={theme.components.icon.size.sm}
                  color={accentColor}
                />
                <Text style={[styles.roleActionText, { color: accentColor }]}>
                  {item.role === 'admin' ? 'Fjern admin' : 'Gør til admin'}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: accentColor }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.bg.card} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Medlemmer
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {/* Spacer to center title */}
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={theme.components.icon.size.lg} color={theme.colors.text.secondary} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={theme.components.icon.size.lg} color={theme.colors.text.secondary} />
          <Text style={styles.emptyText}>Ingen medlemmer endnu</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof useTheme>, accentColor: string) =>
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
    },
    backButton: {
      padding: theme.spacing[1],
    },
    headerContent: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '600',
      color: theme.colors.bg.card,
    },
    headerSubtitle: {
      fontSize: theme.typography.small.fontSize,
      color: theme.colors.bg.card,
      opacity: 0.8,
    },
    headerSpacer: {
      width: theme.spacing[8],
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
    },
    emptyText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      textAlign: 'center',
    },
    list: {
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
    },
    separator: {
      height: theme.layout.borderHairline,
      backgroundColor: theme.colors.border.default,
      marginVertical: theme.spacing[0],
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[2],
    },
    avatar: {
      width: theme.spacing[11],
      height: theme.spacing[11],
      borderRadius: theme.radius.pill,
    },
    avatarPlaceholder: {
      width: theme.spacing[11],
      height: theme.spacing[11],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.elevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: theme.spacing[3],
      gap: theme.spacing[2],
    },
    memberName: {
      fontSize: theme.typography.body.fontSize,
      fontWeight: '600',
      color: theme.colors.text.primary,
      flexShrink: 1,
    },
    roleBadge: {
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[0],
      borderRadius: theme.radius.pill,
    },
    roleBadgeText: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
      color: theme.colors.text.inverse,
    },
    roleActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    roleActionText: {
      fontSize: theme.typography.small.fontSize,
      fontWeight: '600',
    },
  });
