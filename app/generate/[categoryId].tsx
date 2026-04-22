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
    setBusy(true);
    const res = await start({
      imageBase64: base64,
      categoryId: category.id,
      subcategoryIds: Array.from(selected),
      onPaywall: () => setPaywall(true),
    });
    setBusy(false);
    if (res) router.replace('/generate/results');
    else {
      // start() returns null on error after setting store.error. Surface it.
      const err = useGenerationStore.getState().error;
      if (err) show(err, 'error');
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
        <Text style={styles.title}>
          {category.emoji} {category.label}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {selectedPhotoUri ? <Image source={{ uri: selectedPhotoUri }} style={styles.preview} /> : null}

        <View style={styles.row}>
          <Text style={styles.section}>Pick variations</Text>
          <Pressable onPress={toggleAll}>
            <Text style={styles.allLink}>{allSelected ? 'Clear' : 'Select all'}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {category.subcategories.map((s) => {
            const active = selected.has(s.id);
            return (
              <Pressable key={s.id} onPress={() => toggle(s.id)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ height: spacing.xl }} />
        <Button label={`Generate ${selected.size > 0 ? `(${selected.size})` : ''}`} onPress={handleGenerate} />
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
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 26 },
  title: { ...typography.h2, color: colors.textPrimary },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  preview: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { ...typography.h3, color: colors.textPrimary },
  allLink: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  chipRow: { gap: spacing.sm },
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
  hint: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
