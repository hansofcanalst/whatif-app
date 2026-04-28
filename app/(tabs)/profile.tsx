import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { ReauthModal } from '@/components/ReauthModal';
import { signOut, deleteAccount, finishAccountDeletion, ReauthRequiredError } from '@/lib/auth';
import { exportAccountData, type ExportProgress } from '@/lib/exportData';
import { captureError } from '@/lib/sentry';
import { config } from '@/constants/config';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function Profile() {
  const router = useRouter();
  const { user, userDoc } = useAuthStore();
  const { isActive, plan, expiresAt } = useSubscriptionStore();
  const [paywall, setPaywall] = useState(false);

  const handleLogout = async () => {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  // Modal-driven destructive flow. The DeleteAccountModal requires the
  // user to retype their email before the Delete button enables —
  // stronger friction than a plain Alert.alert, and works identically
  // across web + native (RNW's Alert.alert collapses to OK/Cancel and
  // doesn't render destructive styling, which is why the previous
  // implementation needed a Platform branch).
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // ReauthModal is shown when deleteAccount() throws
  // ReauthRequiredError. By that point the Firestore + local data
  // wipes have already happened — the user just needs to re-prove
  // their identity so Firebase will let us delete the auth principal.
  // On success, we call finishAccountDeletion() (which is just
  // user.delete()) to complete the flow.
  const [reauthOpen, setReauthOpen] = useState(false);

  // Download-my-data flow. `exportProgress` is null when idle; while
  // export is running it carries a discriminated union describing the
  // current phase (so the row label can say "Bundling 5 of 24…"
  // rather than an unmoving spinner).
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const exporting = exportProgress !== null && exportProgress.step !== 'done';

  const handleExportData = async () => {
    if (!user || exporting) return;
    setExportProgress({ step: 'fetching-meta' });
    try {
      await exportAccountData(user.uid, setExportProgress);
      // Native: the system share sheet has already opened, the user
      // is interacting with it — no extra confirmation needed here.
      // Web: the browser has already triggered a download.
      // Either way, success state is implicit; we just clear the
      // progress so the row label flips back to "Download my data".
    } catch (e) {
      console.warn('[profile] exportAccountData failed', e);
      captureError(e, { where: 'exportAccountData' });
      Alert.alert(
        'Export failed',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setExportProgress(null);
    }
  };

  const exportLabel = (() => {
    if (!exportProgress) return 'Download my data';
    switch (exportProgress.step) {
      case 'fetching-meta':
        return 'Preparing…';
      case 'fetching-images':
        return `Bundling ${exportProgress.loaded} of ${exportProgress.total}…`;
      case 'zipping':
        return 'Compressing…';
      case 'saving':
        return 'Saving…';
      case 'done':
        return 'Download my data';
    }
  })();

  const handleDeleteAccount = () => {
    if (deleting) return;
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // Auth listener will fire null and AuthGate routes to /login —
      // no manual navigation needed. Close the modal so the brief
      // moment between the listener firing and the route swap doesn't
      // show a stale Profile-with-modal.
      setDeleteModalOpen(false);
    } catch (e) {
      // Close the email-confirm modal — at this point the user has
      // already done that step and we shouldn't ask them to do it
      // again. ReauthRequiredError takes us into the inline reauth
      // flow; other errors get a plain alert.
      setDeleteModalOpen(false);
      if (e instanceof ReauthRequiredError) {
        // Firestore + local data are already gone (they happen before
        // user.delete() in the orchestrator). All that remains is the
        // auth principal, which the reauth flow will let us drop.
        setReauthOpen(true);
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

  // Called by ReauthModal after the user successfully re-proves their
  // identity. The data deletes have already happened upstream, so we
  // just need to close out the auth principal.
  const handleReauthSuccess = async () => {
    setReauthOpen(false);
    setDeleting(true);
    try {
      await finishAccountDeletion();
      // Auth listener fires null → AuthGate → /login.
    } catch (e) {
      console.warn('[profile] finishAccountDeletion failed', e);
      Alert.alert(
        'Delete failed',
        e instanceof Error
          ? e.message
          : 'Something went wrong finishing the deletion. Please try again.',
      );
    } finally {
      setDeleting(false);
    }
  };

  // User backed out of the reauth modal. Their data is already gone
  // but their auth account still exists — the right move is to tell
  // them so they aren't surprised next time they try anything.
  const handleReauthCancel = () => {
    setReauthOpen(false);
    Alert.alert(
      'Account partially deleted',
      'Your photos and gallery have been removed, but your sign-in still exists. Log out and back in, then tap Delete Account again to finish.',
    );
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
            {/* Casts avoid a stale typed-routes diagnostic — Expo Router's
                generated `.expo/types/router.d.ts` only learns about new
                routes after the dev server runs once. The cast unblocks
                typecheck pre-restart; once Metro regenerates, the cast
                is a no-op. Standard Expo Router workaround. */}
            <SettingRow
              label="Privacy Policy"
              onPress={() => router.push('/privacy' as never)}
            />
            <View style={styles.divider} />
            <SettingRow
              label="Terms of Service"
              onPress={() => router.push('/terms' as never)}
            />
            <View style={styles.divider} />
            <SettingRow
              label={exportLabel}
              onPress={handleExportData}
              disabled={exporting}
            />
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
      <DeleteAccountModal
        visible={deleteModalOpen}
        email={user?.email ?? null}
        onConfirm={handleDeleteConfirm}
        onClose={() => {
          if (!deleting) setDeleteModalOpen(false);
        }}
        busy={deleting}
      />
      <ReauthModal
        visible={reauthOpen}
        onSuccess={handleReauthSuccess}
        onClose={handleReauthCancel}
      />
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
