import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radii, spacing, typography } from '@/constants/theme';

// AsyncStorage key for the dismissed flag. Versioned ("v1") so we can
// re-introduce a different first-run prompt later (e.g. a new feature
// announcement) without re-showing this one to existing users — bump
// to v2 and write a separate component.
const STORAGE_KEY = 'whatif:onboarding:home:v1';

/**
 * One-time welcome card shown above the PhotoUploader on the home
 * screen. Renders only on the first launch where the flag isn't set;
 * tapping the ✕ button persists the flag and the card disappears
 * forever for that user (or until they reinstall — we don't sync
 * onboarding state across devices, by design).
 *
 * Why a dismissible card rather than a coachmark / modal:
 *   - A modal interrupts the user's first action ("I just opened the
 *     app, let me try it"). Bad UX.
 *   - A coachmark with arrows pointing at the photo uploader is fancy
 *     but takes 2-3x more code and breaks if the layout changes.
 *   - A card lives in the layout flow, doesn't block, and lets the
 *     user absorb the message OR ignore it.
 *
 * Dismissed state is tri-state internally:
 *   - null  → still hydrating from AsyncStorage; render nothing.
 *   - false → flag wasn't set; show the card.
 *   - true  → dismissed; render nothing forever.
 *
 * We deliberately don't show anything during the null state to avoid
 * a frame-flash on first paint. AsyncStorage reads are typically <30ms
 * so there's no perceptible delay.
 */
export function HomeOnboardingCard() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!cancelled) setDismissed(v === '1');
      })
      .catch(() => {
        // On read failure, default to showing the card. Worst case we
        // show it again on a return visit; that's better than silently
        // suppressing the welcome on first launch because of a flaky
        // AsyncStorage init.
        if (!cancelled) setDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {
      // Persist failure is non-fatal — the card stays dismissed for
      // this session. Next launch may re-show it; acceptable.
    });
  };

  if (dismissed !== false) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>👋</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Welcome to What If</Text>
          <Text style={styles.body}>
            Drop a photo below to get started. We'll detect everyone in it,
            then you pick how to transform them — race, age, gender, and more.
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          style={styles.close}
          accessibilityLabel="Dismiss welcome message"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Accent-dim background + soft purple border to mark this as a
  // welcome / first-run affordance distinct from the surface-card
  // styling used elsewhere. Once dismissed the surface is gone, so
  // the visual weight here is a one-time first impression.
  card: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  emoji: { fontSize: 22, marginTop: 2 },
  title: {
    ...typography.bodyBold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Close button — minimal, top-right of the card. Sits on its own so
  // the row layout doesn't push the body text against it on narrow
  // screens.
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
});
