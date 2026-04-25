import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCategory } from '@/constants/categories';
import { getPrompt } from '@/lib/prompts';
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
  // Accessory state — keyed by subcategoryId, value is the set of
  // accessory ids the user ticked for that variant. Stays in sync with
  // `selected`: when a variant is removed, its accessory entry is
  // dropped so we never send modifiers for variants we won't generate.
  const [accessories, setAccessories] = useState<Record<string, Set<string>>>({});
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
      if (next.has(id)) {
        next.delete(id);
        // Untoggling a variant invalidates any accessories the user
        // had ticked under it. Drop the entry so it can't leak back
        // into the request if the variant is re-added later.
        setAccessories((prevAcc) => {
          if (!prevAcc[id]) return prevAcc;
          const { [id]: _drop, ...rest } = prevAcc;
          return rest;
        });
      } else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      setAccessories({});
    } else {
      setSelected(new Set(category.subcategories.map((s) => s.id)));
    }
  };

  // Per-variant accessory toggle. Lazily creates the inner set so
  // accessories[subId] only exists once at least one is ticked, which
  // keeps the request payload small for the common case (no accessories).
  const toggleAccessory = (subId: string, accId: string) => {
    setAccessories((prev) => {
      const inner = new Set(prev[subId] ?? []);
      if (inner.has(accId)) inner.delete(accId);
      else inner.add(accId);
      const next = { ...prev };
      if (inner.size === 0) delete next[subId];
      else next[subId] = inner;
      return next;
    });
  };

  // List of (subcategory, accessory[]) pairs that should appear in the
  // accessories section. Only includes selected variants that have any
  // accessories defined — others are filtered out so the UI doesn't
  // render an empty section header.
  const accessoryRows = useMemo(() => {
    return category.subcategories
      .filter((s) => selected.has(s.id))
      .map((s) => ({ sub: s, accessories: getPrompt(category.id, s.id)?.accessories ?? [] }))
      .filter((row) => row.accessories.length > 0);
  }, [category, selected]);

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
    // Materialize accessory sets into plain arrays, dropping any entries
    // for variants the user didn't ultimately keep selected (defensive —
    // the toggle handler already prunes them, but freshly-built payloads
    // are cheap and certain).
    const modifiers: Record<string, string[]> = {};
    for (const id of selected) {
      const set = accessories[id];
      if (set && set.size > 0) modifiers[id] = Array.from(set);
    }

    const res = await start({
      imageBase64: base64,
      categoryId: category.id,
      subcategoryIds: Array.from(selected),
      modifiers: Object.keys(modifiers).length > 0 ? modifiers : undefined,
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

        {/* Accessories section. Renders only when at least one selected
            variant has accessories defined, so most users won't see it
            at all. Framing is deliberate ("Optional · You choose") to
            make clear this is opt-in styling driven by the user, not
            something the app applies on its own. */}
        {accessoryRows.length > 0 ? (
          <View style={styles.accessorySection}>
            <Text style={styles.sectionLabel}>Optional · You choose</Text>
            <Text style={styles.section}>Add accessories</Text>
            <Text style={styles.accessoryHelp}>
              Layer styling on top of any selected transformation. Tap to add or remove.
            </Text>
            {accessoryRows.map(({ sub, accessories: list }) => (
              <View key={sub.id} style={styles.accessoryGroup}>
                <Text style={styles.accessoryGroupLabel}>{sub.label}</Text>
                <View style={styles.accessoryRow}>
                  {list.map((acc) => {
                    const active = accessories[sub.id]?.has(acc.id) ?? false;
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => toggleAccessory(sub.id, acc.id)}
                        style={[styles.accessoryChip, active && styles.accessoryChipActive]}
                      >
                        <Text
                          style={[
                            styles.accessoryChipText,
                            active && styles.accessoryChipTextActive,
                          ]}
                        >
                          {active ? '✓ ' : '+ '}
                          {acc.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ) : null}

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
  // Accessories block. Visually grouped on its own card-tinted surface
  // to set it apart from the variation chips above — the user reads
  // "this is a different layer of choice" without needing copy to
  // explain it.
  accessorySection: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  accessoryHelp: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  accessoryGroup: { gap: spacing.xs, marginTop: spacing.xs },
  accessoryGroupLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 10,
  },
  accessoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  accessoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accessoryChipActive: {
    backgroundColor: colors.accentDim,
    borderColor: 'rgba(124, 58, 237, 0.45)',
  },
  accessoryChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  accessoryChipTextActive: { color: colors.accentText, fontWeight: '700' },
});
