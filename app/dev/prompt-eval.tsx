// Prompt eval harness — dev-only screen for systematically running
// every category × subcategory against a chosen photo and reviewing
// the outputs side-by-side.
//
// Why this exists:
// As the prompt surface has grown (6 categories, ~25 subcategories,
// 16 accessories, scoping logic, composer fallback, sequential mode),
// it's gotten progressively harder to verify a prompt edit didn't
// regress neighbors. Eyeballing one or two outputs after a prompt
// tweak doesn't catch subtle regressions ("Latino still works but
// now Middle Eastern looks washed out"). This screen lets you run
// the matrix in one shot and visually scan for anomalies.
//
// What it does:
//   - Picks the currently-loaded photo (from generationStore) or
//     prompts the user to pick one if none is set.
//   - Lets you toggle which subcategories to include (defaults to ALL
//     non-premium subcategories — premium ones cost more and the
//     happy-path cases are usually in race/age/gender anyway).
//   - Runs them sequentially through the existing streamGeneration
//     flow, displaying a tile per subcategory with the resulting
//     image (or red X if it failed).
//   - The output grid is just for visual inspection — no rating UI
//     yet (deferred until the simple version proves itself useful).
//
// Access:
//   - Routed at `/dev/prompt-eval`. Not surfaced in the tab bar; you
//     navigate by typing the URL or by tapping a hidden affordance
//     in Profile (added below — long-press the version label).
//   - Only renders the run UI when __DEV__ is true. In production
//     builds the screen redirects back to home, so production users
//     can't accidentally land on it via a stale URL.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CATEGORIES } from '@/constants/categories';
import { useGenerationStore } from '@/stores/generationStore';
import { streamGeneration, type GenerateResponseItem } from '@/lib/gemini';
import { colors, radii, spacing, typography } from '@/constants/theme';

type RunStatus = 'idle' | 'pending' | 'complete' | 'failed';

interface RunSlot {
  categoryId: string;
  categoryLabel: string;
  subcategoryId: string;
  subcategoryLabel: string;
  isPremium: boolean;
  status: RunStatus;
  imageURL?: string;
  error?: string;
}

export default function PromptEvalScreen() {
  const router = useRouter();
  const { selectedPhotoUri, selectedPhotoBase64 } = useGenerationStore();

  // Hidden in non-dev builds. Bypasses the screen entirely so a stale
  // /dev/prompt-eval URL in production doesn't surface a half-broken
  // dev tool to a real user.
  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.body}>Not available in production.</Text>
          <Pressable onPress={() => router.replace('/(tabs)/home' as never)}>
            <Text style={styles.link}>Go home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Build the full grid of available (category, subcategory) pairs.
  // Default-select every non-premium pair — premium runs cost more
  // and the prompts there are mostly already validated. User can
  // tick them on if needed.
  const allPairs = useMemo<RunSlot[]>(() => {
    const out: RunSlot[] = [];
    for (const cat of CATEGORIES) {
      for (const sub of cat.subcategories) {
        out.push({
          categoryId: cat.id,
          categoryLabel: cat.label,
          subcategoryId: sub.id,
          subcategoryLabel: sub.label,
          isPremium: cat.isPremium,
          status: 'idle',
        });
      }
    }
    return out;
  }, []);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const p of allPairs) {
      if (!p.isPremium) s.add(`${p.categoryId}/${p.subcategoryId}`);
    }
    return s;
  });
  const [slots, setSlots] = useState<RunSlot[]>(allPairs);
  const [running, setRunning] = useState(false);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runEval = async () => {
    if (running) return;
    if (!selectedPhotoBase64) {
      // Block with a clear message rather than silently failing.
      // Stuck-on-this-state is visible feedback for the dev.
      return;
    }

    // Group selected pairs by category so we can dispatch one stream
    // per category (server expects subcategoryIds within a single
    // category). Cross-category runs are sequential.
    const byCategory: Record<string, RunSlot[]> = {};
    for (const pair of allPairs) {
      const key = `${pair.categoryId}/${pair.subcategoryId}`;
      if (!selected.has(key)) continue;
      (byCategory[pair.categoryId] ??= []).push(pair);
    }

    // Reset slot states for the run set; leave un-selected ones idle.
    setSlots((prev) =>
      prev.map((s) => {
        const key = `${s.categoryId}/${s.subcategoryId}`;
        return selected.has(key)
          ? { ...s, status: 'pending', imageURL: undefined, error: undefined }
          : { ...s, status: 'idle', imageURL: undefined, error: undefined };
      }),
    );

    setRunning(true);
    try {
      // One stream per category. Within a stream, subcategoryIds run
      // server-side in their own loop (re-uses the existing pipeline,
      // including retry + composer + sequential mode).
      for (const [categoryId, pairs] of Object.entries(byCategory)) {
        const subIds = pairs.map((p) => p.subcategoryId);
        // eslint-disable-next-line no-await-in-loop
        await streamGeneration(
          {
            imageBase64: selectedPhotoBase64,
            category: categoryId,
            subcategoryIds: subIds,
          },
          (ev) => {
            if (ev.type === 'result') {
              const subId = subIds[ev.index];
              applyResult(categoryId, subId, 'complete', ev.item);
            } else if (ev.type === 'error') {
              applyResult(categoryId, ev.subcategoryId, 'failed', undefined, ev.message);
            }
          },
        ).catch((err) => {
          // A whole-category failure marks every still-pending slot
          // in that category as failed with the error.
          const reason = err instanceof Error ? err.message : 'Run failed';
          for (const subId of subIds) {
            applyResult(categoryId, subId, 'failed', undefined, reason);
          }
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const applyResult = (
    categoryId: string,
    subcategoryId: string,
    status: RunStatus,
    item?: GenerateResponseItem,
    error?: string,
  ) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.categoryId === categoryId && s.subcategoryId === subcategoryId
          ? { ...s, status, imageURL: item?.imageURL, error }
          : s,
      ),
    );
  };

  const visibleSlots = slots.filter((s) =>
    selected.has(`${s.categoryId}/${s.subcategoryId}`),
  );
  const allDone =
    visibleSlots.length > 0 &&
    visibleSlots.every((s) => s.status === 'complete' || s.status === 'failed');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Dev tools</Text>
          <Text style={styles.title}>Prompt eval</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!selectedPhotoBase64 ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>No photo loaded</Text>
            <Text style={styles.body}>
              Pick a photo on the home screen first, then come back here.
              The eval runs against whatever is currently loaded in the
              generation store.
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/home' as never)}
              style={styles.linkBtn}
            >
              <Text style={styles.link}>Go to home</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.previewWrap}>
              <Image source={{ uri: selectedPhotoUri ?? undefined }} style={styles.preview} />
            </View>

            <Text style={styles.section}>Run set</Text>
            <Text style={styles.sectionSub}>
              Tap to include / exclude. Premium categories are off by
              default — toggle them on if you want full coverage.
            </Text>

            {/* Category rows. One row per category, chips for each sub. */}
            {CATEGORIES.map((cat) => (
              <View key={cat.id} style={styles.catBlock}>
                <Text style={styles.catLabel}>
                  {cat.emoji} {cat.label}
                  {cat.isPremium ? ' · PRO' : ''}
                </Text>
                <View style={styles.chipRow}>
                  {cat.subcategories.map((sub) => {
                    const key = `${cat.id}/${sub.id}`;
                    const active = selected.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => toggleSelected(key)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {active ? '✓ ' : ''}
                          {sub.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Pressable
              onPress={runEval}
              disabled={running || selected.size === 0}
              style={[styles.runBtn, (running || selected.size === 0) && styles.runBtnDisabled]}
            >
              <Text style={styles.runBtnText}>
                {running
                  ? `Running ${visibleSlots.filter((s) => s.status === 'complete' || s.status === 'failed').length}/${visibleSlots.length}…`
                  : `Run ${selected.size} prompt${selected.size === 1 ? '' : 's'}`}
              </Text>
            </Pressable>

            {/* Result grid. Renders only the selected pairs. Each tile
                shows the image when complete, a spinner while pending,
                or a red error message when failed. */}
            {visibleSlots.length > 0 ? (
              <View style={styles.resultsBlock}>
                <Text style={styles.section}>
                  Results
                  {allDone ? ' · done' : running ? ' · running' : ''}
                </Text>
                <View style={styles.grid}>
                  {visibleSlots.map((slot) => (
                    <View
                      key={`${slot.categoryId}/${slot.subcategoryId}`}
                      style={styles.tile}
                    >
                      {slot.status === 'complete' && slot.imageURL ? (
                        <Image source={{ uri: slot.imageURL }} style={styles.tileImage} />
                      ) : slot.status === 'failed' ? (
                        <View style={styles.tilePlaceholder}>
                          <Text style={styles.failGlyph}>!</Text>
                          <Text style={styles.failText} numberOfLines={3}>
                            {slot.error ?? 'failed'}
                          </Text>
                        </View>
                      ) : slot.status === 'pending' ? (
                        <View style={styles.tilePlaceholder}>
                          <ActivityIndicator color={colors.accent} />
                        </View>
                      ) : (
                        <View style={styles.tilePlaceholder} />
                      )}
                      <View style={styles.tileFooter}>
                        <Text style={styles.tileLabel} numberOfLines={1}>
                          {slot.subcategoryLabel}
                        </Text>
                        <Text style={styles.tileCat} numberOfLines={1}>
                          {slot.categoryLabel}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 26 },
  headerTitle: { alignItems: 'center', flex: 1 },
  headerLabel: { ...typography.label, color: colors.textLabel, fontSize: 10 },
  title: { ...typography.h3, color: colors.textPrimary },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  banner: {
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  bannerTitle: { ...typography.h3, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  linkBtn: { paddingTop: spacing.sm },
  link: { ...typography.bodyBold, color: colors.accentText },
  previewWrap: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  preview: { width: '100%', height: '100%' },
  section: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md },
  sectionSub: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  catBlock: { gap: spacing.xs, marginTop: spacing.sm },
  catLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 11,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accentDim,
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.accentText, fontWeight: '700' },
  runBtn: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  runBtnDisabled: { opacity: 0.5 },
  runBtnText: { ...typography.bodyBold, color: '#ffffff' },
  resultsBlock: { gap: spacing.sm, marginTop: spacing.lg },
  // Three-up grid using percentage widths + flex-wrap. FlatList here
  // would be overkill — even the full matrix is ~25 tiles, not a
  // virtualization problem.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31.5%',
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileImage: { width: '100%', aspectRatio: 1 },
  tilePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  failGlyph: {
    fontSize: 22,
    color: 'rgba(239, 68, 68, 0.7)',
    fontWeight: '900',
  },
  failText: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  tileFooter: { padding: spacing.xs, gap: 1 },
  tileLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  tileCat: { ...typography.tiny, color: colors.textMuted },
});
