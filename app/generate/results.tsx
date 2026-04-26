import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ResultsGrid } from '@/components/ResultsGrid';
import { Button } from '@/components/ui/Button';
import { useGenerationStore } from '@/stores/generationStore';
import { getCategory } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

// Heuristic: how long a single Nano Banana call typically takes, in ms.
// Used to drive the time-based estimated progress bar — the actual API
// gives no sub-call progress signal, so we fake forward motion based on
// elapsed time and snap to truth as variants actually complete. Tuned
// from observed run times (single-pass: 8–14s, with composer overhead
// nudging it toward the upper end). See progress useMemo below.
const PER_VARIANT_MS = 12000;

// Rotating flavor copy shown while the stream is open. Mirrors the set
// on LoadingSpinner so the brand voice is consistent across the two
// loading surfaces — the pre-stream spinner on the category screen and
// this streaming-progress block. Cadence (2.2s) also matches.
const FLAVOR_TAGLINES = [
  'Rewriting your DNA…',
  'Consulting the multiverse…',
  'Breaking the space-time continuum…',
  'Your other self is loading…',
  'Shuffling timelines…',
];

export default function ResultsScreen() {
  const router = useRouter();
  const {
    currentResults,
    currentGenerationId,
    currentCategoryId,
    generationSlots,
    generationInFlight,
  } = useGenerationStore();
  const category = currentCategoryId ? getCategory(currentCategoryId) : null;

  // Prefer slots when the stream is active or has produced any slots —
  // the slot shape carries pending/failed status the plain results list
  // can't express. Fall back to currentResults so this screen still
  // works if someone wires it up for a non-streaming code path.
  const usingSlots = generationInFlight || generationSlots.length > 0;

  // Run-start tracking for the time-based estimated progress bar.
  // runStartedAt is set the first tick generationInFlight goes true and
  // cleared the first tick it goes false. peopleFactor captures the
  // sequential-mode multiplier (~12s × N people per variant) at start
  // time, so the estimate scales correctly when the user picked a
  // multi-person sequential run vs. a single-pass run.
  const runStartedAt = useRef<number | null>(null);
  const peopleFactor = useRef(1);
  useEffect(() => {
    if (generationInFlight) {
      if (runStartedAt.current == null) {
        runStartedAt.current = Date.now();
        const { detectedPeople, selectedPersonIds } = useGenerationStore.getState();
        const isSequential =
          detectedPeople.length > 1 && selectedPersonIds.length >= 2;
        peopleFactor.current = isSequential ? selectedPersonIds.length : 1;
      }
    } else {
      runStartedAt.current = null;
      peopleFactor.current = 1;
    }
  }, [generationInFlight]);

  // Tick state to drive recompute of the time-based progress estimate
  // every ~250ms. Doesn't render anything itself — just changes a useMemo
  // dep so progress.pct reflects elapsed time on each tick.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!generationInFlight) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [generationInFlight]);

  // Progress summary (X of N complete, K failed) plus a derived `pct`
  // that combines real completions with a time-based estimate. Real
  // progress wins whenever it's higher, which means: as variants
  // actually complete, the bar jumps forward to truth; in between, it
  // creeps based on elapsed time. Capped at 95% so we never claim done
  // before the stream actually closes.
  const progress = useMemo(() => {
    const total = generationSlots.length;
    const complete = generationSlots.filter((s) => s.status === 'complete').length;
    const failed = generationSlots.filter((s) => s.status === 'failed').length;
    // Both complete and failed tiles count toward "bar filled" — we don't
    // want the bar to stall on a failed variant since the remaining work
    // has moved on. The text below preserves the complete/failed split.
    const settled = complete + failed;
    const realPct = total > 0 ? settled / total : 0;

    const expectedTotalMs = total * PER_VARIANT_MS * peopleFactor.current;
    const elapsed =
      runStartedAt.current != null ? Date.now() - runStartedAt.current : 0;
    const timePct =
      expectedTotalMs > 0 ? Math.min(elapsed / expectedTotalMs, 0.95) : 0;

    // Real wins when it's actually ahead (events landed); time wins when
    // we're between events. Cap below 1 so the bar can never lie about
    // the stream being complete — full 100% only happens when the block
    // unmounts on `done`.
    const pct = Math.min(0.95, Math.max(realPct, timePct));
    return { total, complete, failed, settled, pct };
    // tick is intentionally a dep — it forces a recompute every 250ms so
    // the time-based estimate advances. generationSlots covers real
    // event arrivals.
  }, [generationSlots, tick]);

  // Rotating flavor copy. Pinned to idx 0 when the stream is idle so a
  // remount after completion doesn't flash a mid-rotation phrase for one
  // frame before the block unmounts.
  const [taglineIdx, setTaglineIdx] = useState(0);
  useEffect(() => {
    if (!generationInFlight) {
      setTaglineIdx(0);
      return;
    }
    const t = setInterval(
      () => setTaglineIdx((i) => (i + 1) % FLAVOR_TAGLINES.length),
      2200,
    );
    return () => clearInterval(t);
  }, [generationInFlight]);

  // Smooth bar fill. Drives a single shared value via withTiming so both
  // time-based creep (small frequent changes) and real-completion jumps
  // (larger, infrequent) animate over 300ms instead of snapping. The
  // 250ms tick produces a width change every quarter-second; 300ms
  // animation overlap is just barely enough to make the bar look like
  // it's moving continuously rather than ticking.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress.pct, { duration: 300 });
  }, [progress.pct, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  const onSelect = (idx: number) => {
    // Defer tile taps until the stream is done. Mid-stream, the
    // Firestore/localGallery record hasn't been written yet, so the
    // /result/[id] detail screen (which reads from those stores) would
    // land on an empty document. Once the stream closes, both writes
    // have happened and navigation works normally.
    if (generationInFlight) return;
    if (!currentGenerationId) return;
    router.push(`/result/${currentGenerationId}?idx=${idx}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)/home')} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Results</Text>
          <Text style={styles.title}>Your What Ifs</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      {category ? (
        <View style={styles.categoryTag}>
          <Text style={styles.categoryText}>
            {category.emoji} {category.label}
          </Text>
        </View>
      ) : null}

      {/* Streaming progress block. Shown only while the NDJSON stream
          is still open. Disappears on `done`, at which point the grid
          itself communicates the final state. Bar is time-based
          estimation (smoothed via Reanimated) — Gemini gives no real
          per-call progress, so we estimate forward motion and snap to
          truth as variants land. Capped at 95% so we never lie about
          being done; the only way to see 100% would be the moment
          before unmount on `done`. */}
      {generationInFlight ? (
        <View style={styles.progressBlock}>
          <Text style={styles.progressTagline}>Generating · {Math.round(progress.pct * 100)}%</Text>
          <View style={styles.progressBarTrack}>
            <Animated.View style={[styles.progressBarFill, fillStyle]} />
          </View>
          <Text style={styles.progressText}>
            {progress.complete} of {progress.total} ready
            {progress.failed > 0 ? ` · ${progress.failed} failed` : ''}
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {usingSlots ? (
          <ResultsGrid
            slots={generationSlots}
            onSelect={onSelect}
            pendingCaption={generationInFlight ? FLAVOR_TAGLINES[taglineIdx] : undefined}
          />
        ) : (
          <ResultsGrid results={currentResults} onSelect={onSelect} />
        )}
        <View style={styles.actions}>
          <Button
            label="Generate More"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
            disabled={generationInFlight}
          />
          <Button
            label="Done"
            onPress={() => router.replace('/(tabs)/gallery')}
            style={{ flex: 1 }}
            disabled={generationInFlight}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { alignItems: 'center' },
  headerLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 10,
    marginBottom: 2,
  },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textPrimary, fontSize: 20 },
  title: { ...typography.h3, color: colors.textPrimary },
  categoryTag: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
    marginTop: spacing.md,
  },
  categoryText: { ...typography.caption, color: colors.accentText, fontWeight: '700' },
  progressBlock: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
  },
  progressTagline: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
