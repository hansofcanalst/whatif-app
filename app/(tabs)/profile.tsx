import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Alert } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { signOut } from '@/lib/auth';
import { config } from '@/constants/config';
import { colors, spacing, typography } from '@/constants/theme';

export default function Profile() {
  const { user, userDoc } = useAuthStore();
  const { isActive, plan, expiresAt } = useSubscriptionStore();
  const [paywall, setPaywall] = useState(false);

  const handleLogout = async () => {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const remaining = userDoc
    ? Math.max(0, config.freeGenerationCap - userDoc.freeGenerationsUsed)
    : 0;
  const used = userDoc ? userDoc.freeGenerationsUsed : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Card>
          <Text style={styles.name}>{user?.displayName || user?.email || 'You'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Card>

        <Card>
          {isActive ? (
            <>
              <Text style={styles.planBadge}>PRO ✦</Text>
              <Text style={styles.planName}>{plan ? `${plan[0].toUpperCase()}${plan.slice(1)} plan` : 'Pro plan'}</Text>
              {expiresAt ? (
                <Text style={styles.planMeta}>Renews {new Date(expiresAt).toLocaleDateString()}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.planName}>Free Plan</Text>
              <Text style={styles.planMeta}>
                {used}/{config.freeGenerationCap} free generations used · {remaining} remaining
              </Text>
              <View style={{ height: spacing.md }} />
              <Button label="Upgrade to Pro" onPress={() => setPaywall(true)} />
            </>
          )}
        </Card>

        <View style={styles.settings}>
          <SettingRow label="Privacy Policy" />
          <SettingRow label="Terms of Service" />
          <SettingRow label="Delete Account" destructive />
          <Pressable onPress={handleLogout} style={styles.logout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
    </SafeAreaView>
  );
}

function SettingRow({ label, destructive }: { label: string; destructive?: boolean }) {
  return (
    <Pressable style={styles.row}>
      <Text style={[styles.rowLabel, destructive && { color: colors.danger }]}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: colors.textPrimary },
  name: { ...typography.h2, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  planBadge: { ...typography.tiny, color: colors.accent, letterSpacing: 2 },
  planName: { ...typography.h3, color: colors.textPrimary, marginTop: 2 },
  planMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  settings: { gap: 2, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgCard,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { color: colors.textMuted, fontSize: 20 },
  logout: {
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
  },
  logoutText: { ...typography.bodyBold, color: colors.danger },
  version: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
