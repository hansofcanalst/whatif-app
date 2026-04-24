import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Button } from './ui/Button';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface ConsentModalProps {
  visible: boolean;
  /** Called when the user acknowledges consent and wants to continue. */
  onConfirm: () => void;
  /** Called when the user backs out. */
  onClose: () => void;
}

/**
 * One-time, per-session consent gate shown before premium generations
 * (political-mashup, celebrity-mashup, ethnicity-blend). These categories
 * re-mix a real person's likeness with specific third parties, so we ask
 * the user to confirm they have consent from everyone depicted in the
 * uploaded photo before we hand the image to the model.
 *
 * Parent wires the `hasGivenConsent` session flag (see home.tsx) so the
 * modal only shows once per app launch. Refreshing the app resets the
 * acknowledgment — intentional, so returning users re-read the prompt
 * if they upload a new photo set in a new session.
 *
 * Hard minor-block lives upstream of this modal: if any detected person
 * has `appearsUnder18 === true`, the home screen blocks premium
 * categories outright and this modal never opens.
 */
export function ConsentModal({ visible, onConfirm, onClose }: ConsentModalProps) {
  const [ack, setAck] = useState(false);

  const handleConfirm = () => {
    if (!ack) return;
    onConfirm();
    // Reset the checkbox for subsequent openings (defensive — the parent
    // session flag should prevent re-opens, but resetting avoids a stale
    // "already checked" state if that flag is ever cleared).
    setAck(false);
  };

  const handleClose = () => {
    setAck(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>CONSENT ✦</Text>
            </View>
            <Text style={styles.title}>Before we transform this photo</Text>
            <Text style={styles.subtitle}>
              This transformation re-mixes a real person's likeness. Please
              confirm the points below before continuing.
            </Text>

            <View style={styles.bulletBlock}>
              <Bullet>
                Everyone in this photo is an adult (18+), and you have their
                permission to generate transformed images of them.
              </Bullet>
              <Bullet>
                You will not use the results to harass, defame, deceive, or
                sexualize any real person.
              </Bullet>
              <Bullet>
                You understand the output is an AI-generated depiction, not a
                real photograph, and you will label it as such if shared.
              </Bullet>
            </View>

            <Pressable
              onPress={() => setAck((v) => !v)}
              style={styles.ackRow}
              hitSlop={8}
            >
              <View style={[styles.checkbox, ack && styles.checkboxOn]}>
                {ack ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.ackText}>
                I confirm all of the above.
              </Text>
            </Pressable>

            <Button
              label="Continue"
              onPress={handleConfirm}
              disabled={!ack}
              style={{ marginTop: spacing.lg, opacity: ack ? 1 : 0.5 }}
            />
            <Pressable onPress={handleClose} style={{ marginTop: spacing.md }}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
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
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  badgeText: { ...typography.label, color: colors.accentText, fontSize: 11, letterSpacing: 2 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md, letterSpacing: -0.8 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },

  bulletBlock: { marginTop: spacing.xl, gap: spacing.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
  },
  bulletText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 22 },

  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  ackText: { ...typography.body, color: colors.textPrimary, flex: 1 },

  cancel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', textDecorationLine: 'underline' },
});
