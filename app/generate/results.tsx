import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ResultsGrid } from '@/components/ResultsGrid';
import { Button } from '@/components/ui/Button';
import { useGenerationStore } from '@/stores/generationStore';
import { getCategory } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

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

  // Progress summary (X of N complete, K failed). Only shown while the
  // stream is running — once complete, the grid itself is the status.
  const progress = useMemo(() => {
    const total = generationSlots.length;
    const complete = generationSlots.filter((s) => s.status === 'complete').length;
    const failed = generationSlots.filter((s) => s.status === 'failed').length;
    // Both complete and failed tiles count toward "bar filled" — we don't
    // want the bar to stall on a failed variant since the remaining work
    // has moved on. The text below preserves the complete/failed split.
    const settled = complete + failed;
    // Honest limitation: Gemini doesn't emit sub-call progress, so we
    // can't track work inside a single Nano Banana pass. When nothing
    // has settled yet, we fall back to an indeterminate shimmer (handled
    // below). Once the first tile lands, switch to proportional fill.
    const indeterminate = settled === 0;
    const pct = total > 0 ? settled / total : 0;
    return { total, complete, failed, settled, pct, indeterminate };
  }, [generationSlots]);

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

  // Indeterminate-shimmer driver. A narrow bar (30% of track width)
  // slides left → right continuously while we're waiting on the first
  // completion. Stops and resets as soon as any tile settles — past that
  // point the fixed proportional fill is more informative than motion.
  //
  // Using marginLeft with a percentage string works reliably on RN
  // web + native; translateX with percent strings is less portable.
  const shimmer = useSharedValue(-30);
  useEffect(() => {
    if (generationInFlight && progress.indeterminate) {
      shimmer.value = -30;
      shimmer.value = withRepeat(
        withTiming(100, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(shimmer);
      shimmer.value = 0;
    }
  }, [generationInFlight, progress.indeterminate, shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({
    marginLeft: `${shimmer.value}%`,
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
          is still open. Disappears once the server sends `done`, at
          which point the grid itself communicates the final state.
          Header is a static "Generating" — the rotating flavor copy
          ("Consulting the multiverse…") lives on the pending tiles
          themselves, where there's more visual space and the spinner
          gives it a natural home. The bar is indeterminate (sliding
          shimmer) until the first tile settles, then switches to a
          proportional fill for the rest of the run. */}
      {generationInFlight ? (
        <View style={styles.progressBlock}>
          <Text style={styles.progressTagline}>Generating</Text>
          <View style={styles.progressBarTrack}>
            {progress.indeterminate ? (
              <Animated.View style={[styles.progressBarShimmer, shimmerStyle]} />
            ) : (
              <View style={[styles.progressBarFill, { width: `${progress.pct * 100}%` }]} />
            )}
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
  progressBarShimmer: {
    // Narrow bar that slides across the track via an animated marginLeft.
    // 30% width is wide enough to read as motion without looking like a
    // genuine fill. Height fills the track.
    width: '30%',
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
