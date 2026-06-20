import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Button } from './ui/Button';
import { colors, radii, spacing, typography } from '@/constants/theme';

interface AIDisclosureModalProps {
  visible: boolean;
  /** User accepts; caller records consent durably and continues generating. */
  onAgree: () => void;
  /** User declines; caller closes and does NOT generate. */
  onDecline: () => void;
}

/**
 * One-time, durably-persisted disclosure shown before a user's photo is sent
 * to the third-party Gemini AI for the FIRST time. Required for the App Store
 * privacy review (face-data handling). Enforcement lives in the generation
 * chokepoint (hooks/useGeneration.ts start()), which blocks the send until
 * consent is recorded; this modal is the presentation layer the two call
 * sites (category picker + trend tap) open via onNeedsConsent.
 *
 * Not to be confused with components/ConsentModal.tsx — that is a separate,
 * per-session likeness/age confirmation for the Pro ethnicity-blend category.
 */
export function AIDisclosureModal({ visible, onAgree, onDecline }: AIDisclosureModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BEFORE YOU START ✦</Text>
            </View>
            <Text style={styles.title}>Before you start</Text>
            <Text style={styles.body}>
              To create your transformations, the photo you choose is securely
              sent to Google's Gemini AI for processing. Your photo is used only
              to generate your result and is not used to train Google's models.
            </Text>

            <Button label="Agree & Continue" onPress={onAgree} style={{ marginTop: spacing.xl }} />
            <Pressable
              onPress={onDecline}
              style={{ marginTop: spacing.md }}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.decline}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 22 },
  decline: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
