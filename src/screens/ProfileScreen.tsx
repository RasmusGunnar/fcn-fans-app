import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { OutlineButton } from '../components/ui/OutlineButton';
import { colors, spacing } from '../theme';

function SectionCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {icon && <Ionicons name={icon as any} size={16} color={colors.fcnRed} />}
      </View>
      {children}
    </Card>
  );
}

function ProfileRow({ icon, title, subtitle, onPress, isLogout }: { icon: string; title: string; subtitle?: string; onPress?: () => void; isLogout?: boolean }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, isLogout && { backgroundColor: colors.fcnRed }]}>
        <Ionicons name={icon as any} size={16} color={isLogout ? colors.card : colors.card} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, isLogout && { color: colors.fcnRed }]}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      // ignore
    }
  };

  const navigateToCommunity = () => {
    (navigation as any).navigate('CommunityDetail');
  };

  const navigateToMatch = () => {
    (navigation as any).navigate('MatchDetails');
  };

  const navigateToTrip = () => {
    (navigation as any).navigate('BusTripDetails');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: tabBarHeight + spacing.lg }}
    >
      <AppHeader
        title="Min Profil"
        subtitle="Indstillinger & fællesskaber"
        showProfileButton={false}
      />

      <Card style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <View style={styles.profileSummary}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.card} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Morten Hansen</Text>
            <Text style={styles.profileSubtext}>Medlem siden marts 2023</Text>
            <View style={styles.badges}>
              <Pill label="Fan" variant="red" />
              <Pill label="Ejer af 1 fællesskab" variant="neutral" />
            </View>
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <OutlineButton
            title="Rediger profil"
            icon="pencil"
            onPress={() => console.log('TODO: Edit profile')}
          />
        </View>
      </Card>

      <SectionCard title="MINE FÆLLESSKABER (EJER)" icon="crown">
        <ProfileRow
          icon="people"
          title="Farum Fans"
          subtitle="156 medlemmer • Du er ejer"
          onPress={navigateToCommunity}
        />
      </SectionCard>

      <SectionCard title="MEDLEM AF FÆLLESSKABER">
        <ProfileRow
          icon="people"
          title="Udebane-Crew"
          subtitle="213 medlemmer • Du er medlem"
          onPress={navigateToCommunity}
        />
        <ProfileRow
          icon="people"
          title="Vilde Tigre"
          subtitle="342 medlemmer • Fan fraktion"
          onPress={navigateToCommunity}
        />
      </SectionCard>

      <SectionCard title="DINE KOMMENDE EVENTS">
        <ProfileRow
          icon="calendar"
          title="FCN vs Brøndby"
          subtitle="Søndag 19. januar, kl. 14:00"
          onPress={navigateToMatch}
        />
        <ProfileRow
          icon="bus"
          title="Bustur til Silkeborg"
          subtitle="Lørdag 25. januar, kl. 10:00"
          onPress={navigateToTrip}
        />
      </SectionCard>

      <Card style={{ marginBottom: spacing.md }}>
        <ProfileRow
          icon="notifications"
          title="Notifikationer"
          onPress={() => console.log('TODO: Notifications')}
        />
        <ProfileRow
          icon="settings"
          title="Generelle indstillinger"
          onPress={() => console.log('TODO: Settings')}
        />
        <ProfileRow
          icon="help-circle"
          title="Hjælp & support"
          onPress={() => console.log('TODO: Help')}
        />
        <ProfileRow
          icon="log-out"
          title="Log ud"
          onPress={handleLogout}
          isLogout
        />
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>FCN Fans App v1.0.0</Text>
        <Text style={styles.footerText}>Lavet af fans, til fans ❤️🔵</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  profileSubtext: {
    fontSize: 14,
    color: colors.subtext,
    marginBottom: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 14,
    color: colors.subtext,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
  },
});
