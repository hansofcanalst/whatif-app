import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Button } from './ui/Button';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface DeleteAccountModalProps {
  visible: boolean;
  /** The signed-in user's email — what they have to retype to enable Delete. */
  email: string | null;
  /** Fires when the user has confirmed AND typed their email correctly. */
  onConfirm: () => void;
  /** Fires when the user backs out (Cancel, close button, or backdrop). */
  onClose: () => void;
  /** When true, disables the inputs + shows a spinner on the Delete button. */
  busy?: boolean;
}

/**
 * Strong destructive-action confirmation. Uses the "type your email"
 * pattern (à la GitHub, Stripe) rather than a plain confirm dialog,
 * because account deletion is irreversible and a stray tap on a
 * borrowed phone shouldn't be enough to wipe someone's account.
 *
 * Why type-the-email rather than send-a-link:
 *   - Doesn't need an email-sending service (we don't have one wired
 *     up; would need a Cloud Function + SendGrid/Mailgun).
 *   - Same friction goal as a clicked link — verifies the user knows
 *     who they are right now, can't be done by an opportunistic snooper.
 *   - No email round-trip, so the destructive action stays a single
 *     in-app interaction. Less abandonment, same safety floor.
 *
 * For users without an email (rare — Apple "Hide My Email" still
 * provides a privaterelay address; truly emailless flows are an edge
 * case), we degrade to a "type DELETE" fallback so the friction step
 * remains.
 */
export function DeleteAccountModal({
  visible,
  email,
  onConfirm,
  onClose,
  busy,
}: DeleteAccountModalProps) {
  const [typed, setTyped] = useState('');

  // Reset the input whenever the modal closes — we don't want a stale
  // "matched" state to persist across openings if the user cancels and
  // comes back later.
  useEffect(() => {
    if (!visible) setTyped('');
  }, [visible]);

  // Email comparison is case-insensitive + whitespace-trimmed. Most
  // mail providers treat the local part as case-insensitive in
  // practice, and a user who typed "Foo@Bar.com" instead of
  // "foo@bar.com" almost certainly meant the same address.
  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  const fallback = !normalizedEmail; // No email → use "DELETE" as the magic word.
  const requiredString = fallback ? 'DELETE' : normalizedEmail;
  const matches = fallback
    ? typed.trim() === 'DELETE'
    : typed.trim().toLowerCase() === normalizedEmail;

  const handleConfirm = () => {
    if (!matches || busy) return;
    onConfirm();
  };

  const handleClose = () => {
    if (busy) return; // Don't let backdrop dismiss interrupt an in-flight delete.
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <Pressable
            onPress={handleClose}
            style={styles.closeBtn}
            hitSlop={8}
            disabled={busy}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>DANGER</Text>
            </View>
            <Text style={styles.title}>Delete your account?</Text>
            <Text style={styles.subtitle}>
              This is permanent. Once you tap Delete, the following are
              wiped and cannot be recovered:
            </Text>

            <View style={styles.bulletBlock}>
              <Bullet>Your account and sign-in.</Bullet>
              <Bullet>All your generated images and gallery history.</Bullet>
              <Bullet>Your free-generation count and any Pro status.</Bullet>
            </View>

            <Text style={styles.confirmPrompt}>
              {fallback
                ? 'Type "DELETE" below to confirm.'
                : (
                  <>
                    To confirm, type your email <Text style={styles.confirmEmail}>{email}</Text> below.
                  </>
                )}
            </Text>

            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={fallback ? 'DELETE' : 'your.email@example.com'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={fallback ? 'default' : 'email-address'}
              editable={!busy}
              style={[
                styles.input,
                matches && styles.inputMatched,
              ]}
            />

            <Button
              label={busy ? 'Deleting…' : 'Delete account'}
              onPress={handleConfirm}
              disabled={!matches || busy}
              style={{
                marginTop: spacing.lg,
                opacity: matches && !busy ? 1 : 0.4,
                backgroundColor: colors.danger,
              }}
            />
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.textSecondary} />
                <Text style={styles.busyText}>
                  Removing your data — this can take a few seconds…
                </Text>
              </View>
            ) : (
              <Pressable onPress={handleClose} style={{ marginTop: spacing.md }}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    maxHeight: '90%',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 2,
    padding: spacing.sm,
  },
  closeText: { color: colors.textSecondary, fontSize: 18 },
  // Danger-flavored badge — same shape as ConsentModal's accent badge,
  // but using the danger palette so the visual signal is unmistakable.
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  badgeText: {
    ...typography.label,
    color: colors.dangerText,
    fontSize: 11,
    letterSpacing: 2,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.md,
    letterSpacing: -0.8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },

  bulletBlock: { marginTop: spacing.xl, gap: spacing.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Danger-tinted dots so the bullet list reads as the "what gets
  // destroyed" inventory rather than the consent-style affirmations.
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
    marginTop: 8,
  },
  bulletText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 22 },

  confirmPrompt: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    lineHeight: 22,
  },
  confirmEmail: {
    color: colors.accentText,
    fontWeight: '700',
  },
  input: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    ...typography.body,
  },
  // When the typed text matches, swap the border to the danger color.
  // We deliberately don't use the accent (purple "good") here because
  // the meaning of "match" in this context is "you're about to do
  // something destructive", not "you got the answer right".
  inputMatched: {
    borderColor: colors.danger,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  busyText: { ...typography.caption, color: colors.textSecondary },
  cancel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
