import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { listGenerations } from '@/lib/firestore';
import type { GenerationDoc } from '@/lib/firestore';
import { CATEGORIES } from '@/constants/categories';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function Gallery() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [docs, setDocs] = useState<GenerationDoc[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const items = await listGenerations(user.uid);
      setDocs(items);
    } catch (e) {
      console.warn('gallery load failed', e);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = filter ? docs.filter((d) => d.categoryId === filter) : docs;
  const flat: Array<{ docId: string; resultIdx: number; url: string }> = [];
  visible.forEach((d) => {
    d.results.forEach((r, i) => flat.push({ docId: d.id, resultIdx: i, url: r.imageURL }));
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Your Gallery</Text>
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
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyText}>No generations yet — try your first What If!</Text>
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
  title: { ...typography.h1, color: colors.textPrimary, padding: spacing.xl },
  filters: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary, fontWeight: '700' },
  grid: { padding: spacing.md, paddingBottom: spacing.xxxl },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb: { width: '32.8%', aspectRatio: 1, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.bgCard },
  thumbImage: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
