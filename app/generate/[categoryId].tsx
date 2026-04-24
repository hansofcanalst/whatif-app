import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCategory } from '@/constants/categories';
import { useGenerationStore } from '@/stores/generationStore';
import { useGeneration } from '@/hooks/useGeneration';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PaywallModal } from '@/components/ui/PaywallModal';
import { useToast } from '@/components/ui/Toast';
import { colors, layout, radii, spacing, typography } from '@/constants/theme';

export default function GenerateCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const { show } = useToast();
  const category = getCategory(categoryId || '');
  const { selectedPhotoUri, selectedPhotoBase64 } = useGenerationStore();
  const { start, isPro } = useGeneration();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paywall, setPaywall] = useState(false);
  const [busy, setBusy] = useState(false);

  const base64 = selectedPhotoBase64;

  const allSelected = useMemo(() => {
    if (!category) return false;
    return selected.size === category.subcategories.length;
  }, [selected, category]);

  if (!category) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>Category not found</Text>
      </SafeAreaView>
    );
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(category.subcategories.map((s) => s.id)));
  };

  const handleGenerate = async () => {
    if (!base64) {
      show('Photo data missing — please re-pick your photo.', 'error');
      router.replace('/(tabs)/home');
      return;
    }
    if (selected.size === 0) return show('Select at least one transformation.', 'error');
    // Track busy here for the brief window between click and the server
    // opening the stream. Once `onReady` fires we navigate to /results,
    // which renders its own skeleton UI while the stream fills in.
    setBusy(true);
    let navigated = false;
    const res = await start({
      imageBase64: base64,
      categoryId: category.id,
      subcategoryIds: Array.from(selected),
      onPaywall: () => setPaywall(true),
      onReady: () => {
        // Defense against a racy double-navigation if `onReady` fires
        // more than once (the hook guards against that, but a defensive
        // check keeps navigation state sane regardless).
        if (navigated) return;
        navigated = true;
        setBusy(false);
        router.replace('/generate/results');
      },
    });
    // If start returned before onReady ever fired (paywall, up-front
    // rejection, fatal pre-stream error), clean up the busy overlay
    // here. Otherwise onReady already handled it.
    if (!navigated) {
      setBusy(false);
      if (!res) {
        const err = useGenerationStore.getState().error;
        if (err) show(err, 'error');
      }
    }
  };

  if (busy) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>Category</Text>
          <Text style={styles.title}>
            {category.emoji} {category.label}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {selectedPhotoUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: selectedPhotoUri }} style={styles.preview} />
          </View>
        ) : null}

        <View style={styles.row}>
          <View>
            <Text style={styles.sectionLabel}>Variations</Text>
            <Text style={styles.section}>Pick your transformations</Text>
          </View>
          <Pressable onPress={toggleAll} style={styles.allBtn}>
            <Text style={styles.allLink}>{allSelected ? 'Clear' : 'All'}</Text>
          </Pressable>
        </View>

        {/* FRAME pill chips — accent-muted (violet-600/15) bg with
            violet-300 text when selected; surface-800 + border-subtle
            when idle. Using a wrapping grid rather than a single-line
            horizontal scroll so every option is visible at a glance. */}
        <View style={styles.chipRow}>
          {category.subcategories.map((s) => {
            const active = selected.has(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => toggle(s.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: spacing.lg }} />
        <Button
          label={`Generate ${selected.size > 0 ? `· ${selected.size}` : ''}`}
          onPress={handleGenerate}
        />
        {!isPro ? (
          <Text style={styles.hint}>Counts as 1 free generation regardless of count.</Text>
        ) : null}
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
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
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 26 },
  title: { ...typography.h3, color: colors.textPrimary },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  previewWrap: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    borderRadius: radii.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    marginBottom: spacing.xs,
  },
  section: { ...typography.h3, color: colors.textPrimary },
  allBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  allLink: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  hint: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
