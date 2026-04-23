import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Image, RefreshControl } from 'react-native';
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

  const visible = filter ? docs.filter((d) => d.categoryId === filter) : docs;
  const flat: Array<{ docId: string; resultIdx: number; url: string }> = [];
  visible.forEach((d) => {
    d.results.forEach((r, i) => flat.push({ docId: d.id, resultIdx: i, url: r.imageURL }));
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.sectionLabel}>Archive</Text>
          <Text style={styles.title}>Your Gallery</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{flat.length}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
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
      <ScrollView
        contentContainerStyle={styles.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {flat.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconTile}>
              <Text style={styles.emptyIcon}>✦</Text>
            </View>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>Your generated transformations will appear here.</Text>
          </View>
        ) : (
          <View style={styles.gridInner}>
            {flat.map((item) => (
              <Pressable
                key={`${item.docId}-${item.resultIdx}`}
                onPress={() => router.push(`/result/${item.docId}?idx=${item.resultIdx}`)}
                style={styles.thumb}
              >
                <Image source={{ uri: item.url }} style={styles.thumbImage} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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
  filters: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
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
  grid: { padding: spacing.md, paddingBottom: spacing.xxxl },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb: {
    width: '32.8%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbImage: { width: '100%', height: '100%' },
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
