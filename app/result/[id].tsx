import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { FilteredResultPanel } from '@/components/FilteredResultPanel';
import { CategoryIcon } from '@/components/CategoryIcon';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGenerationStore } from '@/stores/generationStore';
import { getGeneration, GenerationDoc } from '@/lib/firestore';
import { getLocalGeneration } from '@/lib/localGallery';
import { getCategory } from '@/constants/categories';
import { colors, fontFamily, radii, shadows, spacing, typography } from '@/constants/theme';

export default function ResultScreen() {
  const { id, idx } = useLocalSearchParams<{ id: string; idx?: string }>();
  const router = useRouter();
  const idxNum = idx ? parseInt(idx, 10) : 0;
  const { currentGenerationId, currentResults } = useGenerationStore();
  const [doc, setDoc] = useState<GenerationDoc | null>(null);

  useEffect(() => {
    if (!id) return;
    // If the Zustand in-memory results already match the URL id, skip the
    // lookup — we already have everything we need from the just-completed
    // generation. This is the hot path after clicking a ResultsGrid tile.
    if (id === currentGenerationId && currentResults.length > 0) {
      return;
    }
    (async () => {
      // Try Firestore first for production-synced entries, then fall back
      // to the local AsyncStorage gallery. Dev-only `dev_...` ids will
      // never exist in Firestore, so without this fallback clicking a
      // dev-generated thumbnail in the gallery would spin forever on the
      // LoadingSpinner below.
      const remote = await getGeneration(id);
      if (remote) {
        setDoc(remote);
        return;
      }
      const local = await getLocalGeneration(id);
      if (local) setDoc(local);
    })();
  }, [id, currentGenerationId, currentResults.length]);

  // Variant navigation rewrites only the `idx` query param so the
  // browser/native back stack stays one entry deep — the user backs out
  // of "Result" once and lands on the grid, no matter how many variants
  // they flipped through. `router.replace` would also work, but
  // setParams is the documented expo-router primitive for "swap a param,
  // same route".
  //
  // MUST stay above the `if (!current || !original)` early return below —
  // a hook declared after that guard changes the hook count between the
  // loading render (guard true) and the loaded render (guard false), which
  // is the "Rendered more hooks than during the previous render" crash on
  // the gallery-open path. Only depends on `router`, so it's safe up here.
  const setIdx = useCallback(
    (n: number) => {
      router.setParams({ idx: String(n) });
    },
    [router],
  );

  const results = doc?.results ?? currentResults;
  // Prefer the doc's originalImageURL (always a self-contained data URI
  // for local entries, https URL for Firestore entries) over the store's
  // selectedPhotoUri, which only reflects whatever photo the user most
  // recently picked — not necessarily the one this result was generated
  // from. Without the preference, navigating from Gallery to an old
  // result would show the current home-screen photo as "before".
  const original = doc?.originalImageURL ?? useGenerationStore.getState().selectedPhotoUri;
  const categoryId = doc?.categoryId ?? useGenerationStore.getState().currentCategoryId ?? '';
  const current = results[idxNum];

  if (!current || !original) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <LoadingSpinner taglines={false} />
      </SafeAreaView>
    );
  }

  const category = getCategory(categoryId);
  const total = results.length;
  const hasMultiple = total > 1;
  const canPrev = idxNum > 0;
  const canNext = idxNum < total - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.25} />
        </Pressable>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero caption — the editorial moment. Eyebrow doubles as
            "where am I" (variant counter) and brand voice; headline is
            the subcategory because that's the punchline ("Black",
            "1yr Baby", "Russian Military"); meta row shows the category
            for context with its glyph. */}
        <View style={styles.heroCaption}>
          <Text style={styles.eyebrow}>
            ME BUT{hasMultiple ? <Text style={styles.eyebrowMono}> · VARIANT {idxNum + 1} OF {total}</Text> : null}
          </Text>
          <Text style={styles.headline} numberOfLines={2}>
            {current.label}
          </Text>
          {category ? (
            <View style={styles.metaRow}>
              <CategoryIcon
                categoryId={category.id}
                size={13}
                color={colors.textSecondary}
                strokeWidth={2.25}
              />
              <Text style={styles.metaText}>{category.label}</Text>
            </View>
          ) : null}
        </View>

        {/* Glow frame wraps the slider rather than living on the slider
            itself because BeforeAfterSlider uses overflow:hidden to
            clip the dragging "after" layer — and overflow:hidden also
            clips the slider's own shadow. The outer frame has no
            overflow rule, so its accent shadow bleeds outward as
            intended. Same trick the FRAME spec uses for "halo" hero
            cards. */}
        <View style={styles.heroGlow}>
          <BeforeAfterSlider beforeURL={original} afterURL={current.imageURL} />
        </View>

        {hasMultiple ? (
          <View style={styles.variantNav}>
            <Pressable
              onPress={() => canPrev && setIdx(idxNum - 1)}
              disabled={!canPrev}
              style={[styles.navBtn, !canPrev && styles.navBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Previous variant"
              accessibilityState={{ disabled: !canPrev }}
            >
              <ChevronLeft
                size={16}
                color={canPrev ? colors.textPrimary : colors.textMuted}
                strokeWidth={2.25}
              />
              <Text style={[styles.navBtnText, !canPrev && styles.navBtnTextDisabled]}>
                Prev
              </Text>
            </Pressable>
            <Text style={styles.variantCounter}>
              {idxNum + 1} <Text style={styles.variantCounterDim}>/ {total}</Text>
            </Text>
            <Pressable
              onPress={() => canNext && setIdx(idxNum + 1)}
              disabled={!canNext}
              style={[styles.navBtn, !canNext && styles.navBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Next variant"
              accessibilityState={{ disabled: !canNext }}
            >
              <Text style={[styles.navBtnText, !canNext && styles.navBtnTextDisabled]}>
                Next
              </Text>
              <ChevronRight
                size={16}
                color={canNext ? colors.textPrimary : colors.textMuted}
                strokeWidth={2.25}
              />
            </Pressable>
          </View>
        ) : null}

        {/* FilteredResultPanel replaces the bare ShareSheet. It carries
            the same save/share affordances, plus the AI-result image
            re-rendered with one of five tinted filters and the chips
            to switch between them. Save/share captures whatever filter
            the user has selected. See components/FilteredResultPanel.tsx
            for the design rationale (overlay-based filters rather than
            shaders/native filter modules — no new native deps). */}
        <FilteredResultPanel
          imageURL={current.imageURL}
          categoryLabel={category?.label ?? ''}
          subcategoryLabel={current.label}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Slim header — chrome-only. The page's identity (which variant of
  // which transformation) lives in the hero caption below so the top
  // bar can be just the back affordance.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  // Hero caption — eyebrow / headline / meta stack. Tight gap between
  // eyebrow and headline (-1px optical), wider gap below for the meta
  // row so the headline feels like the unit it is.
  heroCaption: { gap: 4, alignItems: 'flex-start' },
  eyebrow: {
    ...typography.label,
    color: colors.accentText,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  // The variant counter ("VARIANT 2 OF 4") is a numeric label — JetBrains
  // Mono gives it the technical, "spec-sheet" feel that pairs with the
  // FRAME wordmark on home. Same trick we used for "WhatIf" / "If".
  eyebrowMono: {
    fontFamily: fontFamily.mono,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 38,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  metaText: { ...typography.caption, color: colors.textSecondary },
  // The glow frame deliberately doesn't set a backgroundColor — the
  // slider inside has its own. A bg here would be visible inside the
  // slider's rounded corners as a haloing edge. shadows.glow's defaults
  // (opacity 0.3, radius 20) are tuned for buttons; bump radius for a
  // hero-sized halo and pull opacity up slightly for visibility against
  // the deep page bg.
  heroGlow: {
    ...shadows.glow,
    shadowOpacity: 0.45,
    shadowRadius: 36,
    borderRadius: radii.xxl,
  },
  // Variant nav strip — pill-shaped surface for prev/next, large-numeric
  // counter in the middle. Sits below the hero so it reads as a control
  // for the image above it, not a header for the section below.
  variantNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  navBtnTextDisabled: { color: colors.textMuted },
  variantCounter: {
    fontFamily: fontFamily.mono,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  variantCounterDim: { color: colors.textSecondary, fontWeight: '500' },
});
