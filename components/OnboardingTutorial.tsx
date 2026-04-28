// 3-step onboarding tutorial — full-screen modal walkthrough shown
// once on first launch (after auth completes).
//
// Distinct from the smaller HomeOnboardingCard:
//   - The card is a passive in-line hint that lives on the home screen
//     until dismissed, easy to ignore.
//   - This tutorial is an active sequential walkthrough that explains
//     the value prop and the three-step flow before the user is
//     dropped into the home screen cold.
//
// Sequencing:
//   1. AuthGate signals a signed-in user.
//   2. We check `whatif:onboarding:tutorial:v1` in AsyncStorage.
//   3. If unset → render the modal over the app shell.
//   4. User can tap Skip on any screen, or page through Next/Done.
//   5. Either action persists the flag and the modal goes away forever.
//
// Why three steps:
//   - Step 1: explain the upload affordance ("Drop a photo")
//   - Step 2: explain the categories ("Pick a direction")
//   - Step 3: explain the result ("See it generated")
// Each step is one screen, one big illustration glyph, one short
// sentence. Tutorial fatigue is real; brief beats thorough.
//
// Why a modal rather than coachmarks pointing at real UI:
//   - Coachmarks are a maintenance burden — they break when the layout
//     shifts. A modal is a self-contained surface that doesn't depend
//     on external positions.
//   - First-launch users haven't loaded a photo yet, so half the
//     coachmark targets (PeopleSelector, generate button) wouldn't be
//     present anyway.
//   - The tutorial works on web too without anchor-element gymnastics.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from './ui/Button';
import { colors, radii, spacing, typography } from '@/constants/theme';

const STORAGE_KEY = 'whatif:onboarding:tutorial:v1';

interface TutorialStep {
  glyph: string;
  label: string;
  title: string;
  body: string;
}

const STEPS: TutorialStep[] = [
  {
    glyph: '↑',
    label: 'STEP 1',
    title: 'Drop a photo',
    body:
      'Upload a clear photo with one or more people. Selfies work great. We\'ll detect everyone in the shot so you can choose who to transform.',
  },
  {
    glyph: '✦',
    label: 'STEP 2',
    title: 'Pick a direction',
    body:
      'Choose what to change — race, age, gender, or unlock celebrity and political mashups with Pro. Each category has multiple variations you can run together.',
  },
  {
    glyph: '◆',
    label: 'STEP 3',
    title: 'See it generated',
    body:
      'Tap Generate and watch the transformations appear one by one. Save your favorites, compare before-and-after, or apply a filter for one more layer of style.',
  },
];

interface OnboardingTutorialProps {
  /**
   * Auth state. The tutorial only renders once a user is signed in —
   * showing it on the login screen would be confusing and would also
   * fire before AsyncStorage hydration is meaningful (the auth gate
   * routes to login on every fresh launch).
   */
  signedIn: boolean;
}

export function OnboardingTutorial({ signedIn }: OnboardingTutorialProps) {
  // Tri-state: null = still hydrating from AsyncStorage; true = should
  // render the modal; false = already seen, never render.
  const [needsShow, setNeedsShow] = useState<boolean | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (cancelled) return;
        setNeedsShow(v !== '1');
      })
      .catch(() => {
        // Default to NOT showing on hydration failure — same logic as
        // HomeOnboardingCard but inverted: a failed read means "I
        // don't know if they've seen it", and a tutorial is more
        // intrusive than a card, so we err on the side of not pestering.
        if (!cancelled) setNeedsShow(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const finish = () => {
    setNeedsShow(false);
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {
      // Persist failure is non-fatal — they won't see it again this
      // session, and likely not next launch (most write failures are
      // temporary). Acceptable.
    });
  };

  if (!signedIn || needsShow !== true) return null;

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={finish}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable
            onPress={finish}
            style={styles.skipBtn}
            hitSlop={8}
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.glyphTile}>
              <Text style={styles.glyph}>{step.glyph}</Text>
            </View>
            <Text style={styles.stepLabel}>{step.label}</Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>

            {/* Pagination dots — purely decorative state indicator,
                taps don't navigate (next/back buttons handle that). */}
            <View style={styles.dotsRow}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === stepIdx && styles.dotActive]}
                />
              ))}
            </View>

            <View style={styles.actions}>
              {stepIdx > 0 ? (
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => setStepIdx((i) => Math.max(0, i - 1))}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                label={isLast ? 'Get started' : 'Next'}
                onPress={() => {
                  if (isLast) finish();
                  else setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
                }}
                style={{ flex: stepIdx > 0 ? 1 : 2 }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  // Skip lives in the top-right corner, deliberately less visually
  // weighted than Next so the encouraged path is clear, but always
  // available for users who already get it.
  skipBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 2,
  },
  skipText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },
  scroll: {
    paddingTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  // Big glyph tile — visual focus of each step. Accent-tinted so the
  // tutorial reads as on-brand rather than generic.
  glyphTile: {
    width: 80,
    height: 80,
    borderRadius: radii.xxl,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  glyph: {
    fontSize: 40,
    color: colors.accentText,
    fontWeight: '900',
    lineHeight: 44,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.sm,
  },
});
