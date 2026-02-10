import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Button, Card } from '../../components/ui';
import { useTheme } from '../../theme';
import { useAuth } from '../../auth/AuthProvider';
import { getCommunities, type Community } from '../../services/communities';
import { supabase } from '../../lib/supabase';
import { ensureProfile } from '../../lib/profile';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingCommunities'>;

export default function OnboardingCommunitiesSetupScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await getCommunities();
      setCommunities(data);
      setLoading(false);
    };
    load();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const handleFinish = async (skipCommunities: boolean) => {
    if (!user?.id) return;

    setSaving(true);
    try {
      if (!skipCommunities && selectedIds.size > 0) {
        const rows = Array.from(selectedIds).map((communityId) => ({
          community_id: communityId,
          user_id: user.id,
          role: 'member',
        }));

        const { error: joinError } = await supabase
          .from('community_members')
          .upsert(rows, { onConflict: 'community_id,user_id' });

        if (joinError) {
          console.warn('[OnboardingCommunities] Join failed:', joinError);
          Alert.alert('Fejl', 'Kunne ikke gemme dine valg. Prøv igen.');
          return;
        }
      }

      await ensureProfile(user.id);
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

      if (updateError || !updated) {
        if (updateError) {
          console.warn('[OnboardingCommunities] Update failed, trying upsert:', updateError);
        }
        const { data: upserted, error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: user.id, onboarding_complete: true }, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (upsertError || !upserted) {
          console.warn('[OnboardingCommunities] Upsert failed:', upsertError);
          Alert.alert('Fejl', 'Kunne ikke afslutte onboarding. Prøv igen.');
          return;
        }
      }

      const parent = navigation.getParent();
      if (parent) {
        parent.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } catch (e) {
      console.warn('[OnboardingCommunities] Unexpected error:', e);
      Alert.alert('Fejl', 'Kunne ikke afslutte onboarding. Prøv igen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scrollable>
      <View style={styles.header}>
        <Text variant="h1">Vælg fællesskaber</Text>
        <Text variant="body" color="secondary">
          Du kan vælge nu eller springe over.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.list}>
          {communities.map((community) => {
            const selected = selectedIds.has(community.id);
            return (
              <Pressable
                key={community.id}
                onPress={() => toggleSelect(community.id)}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={styles.rowText}>
                  <Text variant="bodyBold">{community.name}</Text>
                  <Text variant="small" color="secondary">
                    {community.description || 'Ingen beskrivelse'}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={selected ? theme.colors.primary : theme.colors.text.muted}
                />
              </Pressable>
            );
          })}

          {communities.length === 0 && (
            <Card style={styles.emptyCard}>
              <Text variant="bodyBold">Ingen fællesskaber lige nu</Text>
              <Text variant="body" color="secondary">
                Du kan springe over og vælge senere.
              </Text>
            </Card>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Button
          title="Spring over"
          variant="ghost"
          onPress={() => handleFinish(true)}
          disabled={saving}
          fullWidth
        />
        <Button
          title={saving ? 'Afslutter...' : selectedCount > 0 ? 'Afslut' : 'Afslut uden valg'}
          onPress={() => handleFinish(false)}
          disabled={saving}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    header: {
      gap: theme.spacing[2],
      marginBottom: theme.spacing[4],
    },
    loading: {
      paddingVertical: theme.spacing[6],
      alignItems: 'center',
    },
    list: {
      gap: theme.spacing[2],
    },
    row: {
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      padding: theme.spacing[3],
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.bg.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing[3],
    },
    rowSelected: {
      borderColor: theme.colors.primary,
    },
    rowText: {
      flex: 1,
    },
    emptyCard: {
      padding: theme.spacing[4],
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    footer: {
      marginTop: theme.spacing[5],
      gap: theme.spacing[2],
    },
  });
