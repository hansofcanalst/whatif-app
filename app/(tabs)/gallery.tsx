import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Image, RefreshControl, Alert, Platform, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useGenerationStore } from '@/stores/generationStore';
import { listGenerations } from '@/lib/firestore';
import type { GenerationDoc } from '@/lib/firestore';
import { CATEGORIES } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function Gallery() {
  const { user } = useAuthStore();
  const router = useRouter();
  // Local gallery is kept hydrated and appended-to reactively by the
  // generation hook, so subscribing via Zustand means the tab refreshes
  // automatically as soon as a new generation completes — no pull-to-
  // refresh required.
  const localGallery = useGenerationStore((s) => s.localGallery);
  const hydrateLocalGallery = useGenerationStore((s) => s.hydrateLocalGallery);
  const removeGeneration = useGenerationStore((s) => s.removeGeneration);
  const [remoteDocs, setRemoteDocs] = useState<GenerationDoc[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Re-hydrate local gallery alongside remote refetch so pull-to-
    // refresh can recover from a write that landed while the screen was
    // mounted but before the in-memory slice was updated (rare — usually
    // the store update is instantaneous — but cheap to do anyway).
    await hydrateLocalGallery();
    if (!user) return;
    try {
      const items = await listGenerations(user.uid);
      setRemoteDocs(items);
    } catch (e) {
      console.warn('gallery load failed', e);
    }
  }, [user, hydrateLocalGallery]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Long-press → confirm → delete the entire generation (all its
  // variants — the doc is the unit of persistence, individual results
  // can't be deleted in isolation). Surfaces variant count in the
  // confirm copy so the user knows the scope before tapping through.
  //
  // Web's Alert.alert in React Native Web uses window.confirm(), which
  // only supports OK/Cancel — it ignores the third (destructive) button
  // and returns false on Cancel. We branch on Platform so web users get
  // a proper confirm() prompt rather than a button that silently
  // dismisses with no destructive action.
  const handleDelete = useCallback(
    (docId: string, variantCount: number) => {
      const title = 'Delete this set?';
      const message =
        variantCount > 1
          ? `Removes all ${variantCount} variants from this generation. This can't be undone.`
          : `Removes this transformation. This can't be undone.`;
      const proceed = () => {
        removeGeneration(docId).catch((e) =>
          console.warn('[gallery] removeGeneration failed', e),
        );
      };
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
          proceed();
        }
        return;
      }
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: proceed },
      ]);
    },
    [removeGeneration],
  );

  // Merge the two sources and dedupe by id. Remote wins on collision
  // because its `results[].imageURL` is an https URL (smaller, cacheable)
  // rather than an inline base64 data URI. Local entries appear first
  // within the merged list because they're typically newer than what has
  // been synced to Firestore, and the sort below finishes the job.
  const docs = useMemo(() => {
    const byId = new Map<string, GenerationDoc>();
    for (const d of localGallery) byId.set(d.id, d);
    for (const d of remoteDocs) byId.set(d.id, d);
    const merged = Array.from(byId.values());
    // Sort: anything with a Firestore Timestamp wins over locals (null
    // createdAt); within the same bucket, newer first. Firestore's
    // Timestamp has a numeric `seconds` field — use it directly without
    // reaching for Timestamp.fromDate or similar, so this file stays
    // dependency-free on the web build where firebase/firestore is a
    // heavy import.
    merged.sort((a, b) => {
      const as = a.createdAt?.seconds ?? 0;
      const bs = b.createdAt?.seconds ?? 0;
      return bs - as;
    });
    return merged;
  }, [localGallery, remoteDocs]);

  // 'results' = current behavior (single-image thumb showing the
  // transformed result). 'compare' = split-tile thumb showing the
  // original on the left and the result on the right, divided by the
  // accent line. The original lives on the parent generation doc, so
  // each tile in compare mode pulls from `d.originalImageURL` plus its
  // own `r.imageURL`. Falls back to results-only if a doc somehow
  // lacks an original (legacy local entries).
  const [viewMode, setViewMode] = useState<'results' | 'compare'>('results');

  const visible = filter ? docs.filter((d) => d.categoryId === filter) : docs;
  const flat: Array<{
    docId: string;
    resultIdx: number;
    url: string;
    originalURL?: string;
    variantCount: number;
  }> = [];
  visible.forEach((d) => {
    d.results.forEach((r, i) =>
      flat.push({
        docId: d.id,
        resultIdx: i,
        url: r.imageURL,
        originalURL: d.originalImageURL,
        // Carried so the long-press confirm can say "Delete all 5
        // variants…" without re-looking-up the parent doc.
        variantCount: d.results.length,
      }),
    );
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.sectionLabel}>Archive</Text>
          <Text style={styles.title}>Your Gallery</Text>
        </View>
        <View style={styles.topBarRight}>
          {/* Compact two-state toggle. Lives next to the count badge so
              the top bar density stays the same as before. The compare
              mode reveals the original alongside each result — the
              gallery's most direct answer to "show before and after". */}
          <View style={styles.modeSwitch}>
            <Pressable
              onPress={() => setViewMode('results')}
              style={[styles.modeBtn, viewMode === 'results' && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, viewMode === 'results' && styles.modeTextActive]}>
                Results
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode('compare')}
              style={[styles.modeBtn, viewMode === 'compare' && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, viewMode === 'compare' && styles.modeTextActive]}>
                Compare
              </Text>
            </Pressable>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{flat.length}</Text>
          </View>
        </View>
      </View>
      {/* Horizontal filter bar. `style={styles.filterBar}` pins the outer
          box to its natural height — without flexGrow:0 the ScrollView
          stretches vertically on web (React Native Web's default) and
          the chips get pulled with it. `alignItems: 'center'` on the
          content container is belt-and-braces: even if the outer box
          ever grows, the chips themselves won't. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filters}
      >
        <FilterChip label="All" active={!filter} onPress={() => setFilter(null)} />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            label={`${c.emoji} ${c.label}`}
            active={filter === c.id}
            onPress={() => setFilter(c.id)}
          />
        ))}
      </ScrollView>
      {/* Switched from a ScrollView+map to a FlatList. The map version
          rendered every tile up front, which scaled poorly: a user
          with the local-gallery max (30 generations × up to 6 results
          = 180 thumbnails) was instantiating that many <Image>
          components on first paint. FlatList virtualizes — only the
          tiles in or near the viewport render, the rest are
          placeholder boxes until they scroll into view.
          numColumns=3 gives the same 3-up grid as the original; each
          item uses flex: 1 inside the column wrapper so they share
          the row width evenly without the old 32.8% magic number. */}
      <FlatList
        data={flat}
        keyExtractor={(item) => `${item.docId}-${item.resultIdx}`}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        // windowSize controls how many viewport-heights worth of items
        // are kept rendered above + below the visible area. 5 is the
        // default (~2.5 screens above + below) — explicit so future
        // tuning is obvious.
        windowSize={5}
        // initialNumToRender keeps first paint cheap while still
        // filling the visible viewport on most phone widths.
        initialNumToRender={9}
        // removeClippedSubviews boosts native perf by detaching
        // off-screen views. Has historical bugs on Android in a few
        // RN versions but works cleanly in 0.81.
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconTile}>
              <Text style={styles.emptyIcon}>✦</Text>
            </View>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Your generated transformations will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const showCompare = viewMode === 'compare' && !!item.originalURL;
          return (
            <Pressable
              onPress={() =>
                router.push(`/result/${item.docId}?idx=${item.resultIdx}`)
              }
              onLongPress={() => handleDelete(item.docId, item.variantCount)}
              delayLongPress={400}
              style={styles.thumb}
            >
              {showCompare ? (
                <View style={styles.compareWrap}>
                  <Image source={{ uri: item.originalURL }} style={styles.compareHalf} />
                  <View style={styles.compareDivider} />
                  <Image source={{ uri: item.url }} style={styles.compareHalf} />
                </View>
              ) : (
                <Image source={{ uri: item.url }} style={styles.thumbImage} />
              )}
              {Platform.OS === 'web' ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleDelete(item.docId, item.variantCount);
                  }}
                  style={styles.removeBadge}
                  accessibilityLabel="Remove this generation"
                  hitSlop={4}
                >
                  <Text style={styles.removeBadgeText}>×</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  title: { ...typography.h1, color: colors.textPrimary },
  countBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  countText: { ...typography.label, color: colors.accentText, fontSize: 11 },
  // Outer box for the horizontal filter ScrollView. `flexGrow: 0` +
  // `flexShrink: 0` prevents RNW from stretching it to fill the flex
  // column; `alignSelf: 'stretch'` lets it span the full page width so
  // it can scroll horizontally when the chip row overflows. Height is
  // natural — determined by the chip padding inside.
  filterBar: { flexGrow: 0, flexShrink: 0, alignSelf: 'stretch' },
  filters: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  grid: { padding: spacing.md, paddingBottom: spacing.xxxl, gap: 4 },
  // Each row of three tiles in the FlatList gets this style. The gap
  // gives us the 4px gutter between tiles within a row; vertical gap
  // between rows comes from `grid.gap` above.
  gridRow: { gap: 4 },
  thumb: {
    // FlatList numColumns=3 + flex: 1 gives equal-width thirds of the
    // row, replacing the explicit 32.8% width the old wrap layout used.
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbImage: { width: '100%', height: '100%' },
  // Top-bar right cluster — Compare/Results mode switch + count pill.
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  modeBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  modeBtnActive: {
    backgroundColor: colors.accentDim,
  },
  modeText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
  },
  modeTextActive: {
    color: colors.accentText,
    fontWeight: '700',
  },
  // Compare-mode split tile: two halves divided by a thin accent stripe.
  // resizeMode defaults to 'cover' on RN <Image>, which is what we want
  // here so each half stays subject-focused regardless of source ratio.
  compareWrap: { flex: 1, flexDirection: 'row' },
  compareHalf: { flex: 1, height: '100%' },
  compareDivider: { width: 1, backgroundColor: colors.accent },
  // Corner remove badge — only rendered on web (see Platform check
  // above). Sits over the top-right of each thumbnail with a darkened
  // pill so it stays legible on bright result images.
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(9,9,13,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
    // Nudge the glyph up a touch so the × is optically centered in the
    // pill — its baseline sits low without this.
    marginTop: -1,
  },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  emptyIconTile: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  emptyIcon: { fontSize: 28, color: colors.accentText, fontWeight: '900' },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
