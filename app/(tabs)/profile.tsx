import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { signOut, deleteAccount, ReauthRequiredError } from '@/lib/auth';
import { config } from '@/constants/config';
import { colors, radii, spacing, typography } from '@/constants/theme';

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

  // Tracks whether a delete is in flight, so we can disable the row
  // and avoid double-fires if the user taps twice during the network
  // round-trip (it can take a few seconds when there are many
  // generations to delete).
  const [deleting, setDeleting] = useState(false);

  // Two-step destructive flow: a clear initial confirm explaining
  // what will happen, then we kick off `deleteAccount`. On
  // `ReauthRequiredError` we tell the user to log out and back in,
  // which is what Firebase wants — implementing in-place reauth for
  // every provider (email, Google, Apple) is more code than this
  // edge case warrants right now.
  const handleDeleteAccount = () => {
    if (deleting) return;
    const title = 'Delete account?';
    const message =
      'This permanently removes your account, your generated images, and your gallery. This cannot be undone.';
    const proceed = async () => {
      setDeleting(true);
      try {
        await deleteAccount();
        // Auth listener will fire null and the AuthGate routes the
        // user to /login — no manual navigation needed here.
      } catch (e) {
        if (e instanceof ReauthRequiredError) {
          Alert.alert(
            'Please log in again',
            'For security, recent sign-in is required to delete your account. Log out, sign back in, then try again. (Your data has been removed; only your sign-in record remains.)',
          );
        } else {
          console.warn('[profile] deleteAccount failed', e);
          Alert.alert(
            'Delete failed',
            e instanceof Error ? e.message : 'Something went wrong. Please try again.',
          );
        }
      } finally {
        setDeleting(false);
      }
    };
    if (Platform.OS === 'web') {
      // RNW's Alert.alert collapses to OK/Cancel without honoring the
      // destructive style — call window.confirm directly so the
      // copy renders fully.
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        proceed();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: proceed },
    ]);
  };

  const remaining = userDoc
    ? Math.max(0, config.freeGenerationCap - userDoc.freeGenerationsUsed)
    : 0;
  const used = userDoc ? userDoc.freeGenerationsUsed : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.sectionLabel}>Account</Text>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Identity card — avatar tile beside name/email, FRAME .card. */}
        <Card style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.displayName || user?.email || 'You'}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </Card>

        {/* Plan card — accent-tinted for Pro, neutral for Free. */}
        <Card style={isActive ? styles.planCardPro : styles.planCard}>
          <Text style={[styles.planTag, isActive && styles.planTagPro]}>
            {isActive ? 'PRO ✦' : 'FREE'}
          </Text>
          {isActive ? (
            <>
              <Text style={styles.planName}>
                {plan ? `${plan[0].toUpperCase()}${plan.slice(1)} plan` : 'Pro plan'}
              </Text>
              {expiresAt ? (
                <Text style={styles.planMeta}>
                  Renews {new Date(expiresAt).toLocaleDateString()}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.planName}>Free plan</Text>
              <Text style={styles.planMeta}>
                {used}/{config.freeGenerationCap} generations used · {remaining} remaining
              </Text>
              <View style={{ height: spacing.md }} />
              <Button label="Upgrade to Pro" onPress={() => setPaywall(true)} />
            </>
          )}
        </Card>

        <View style={styles.settings}>
          <Text style={[styles.sectionLabel, { marginLeft: spacing.md, marginBottom: spacing.sm }]}>
            Settings
          </Text>
          <View style={styles.settingsCard}>
            <SettingRow label="Privacy Policy" />
            <View style={styles.divider} />
            <SettingRow label="Terms of Service" />
            <View style={styles.divider} />
            <SettingRow
              label={deleting ? 'Deleting…' : 'Delete Account'}
              destructive
              onPress={handleDeleteAccount}
              disabled={deleting}
            />
          </View>
        </View>

        <Pressable onPress={handleLogout} style={styles.logout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
    </SafeAreaView>
  );
}

function SettingRow({
  label,
  destructive,
  onPress,
  disabled,
}: {
  label: string;
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.row, disabled && styles.rowDisabled]}
    >
      <Text style={[styles.rowLabel, destructive && { color: colors.dangerText }]}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.sm },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  title: { ...typography.h1, color: colors.textPrimary },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accentText,
  },
  name: { ...typography.h3, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  planCard: {},
  planCardPro: {
    borderColor: 'rgba(124, 58, 237, 0.4)',
    backgroundColor: colors.accentDim,
  },
  planTag: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
  },
  planTagPro: { color: colors.accentText, letterSpacing: 2 },
  planName: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xs },
  planMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },

  settings: { gap: 0 },
  settingsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { color: colors.textMuted, fontSize: 20 },
  // Visual feedback for in-flight destructive actions — primarily the
  // "Deleting…" state on the Delete Account row while the network
  // operations resolve.
  rowDisabled: { opacity: 0.5 },
  divider: { height: 1, backgroundColor: colors.border },
  logout: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
  },
  logoutText: { ...typography.bodyBold, color: colors.dangerText },
  version: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
