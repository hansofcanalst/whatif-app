// Filtered-result panel — replaces the bare ShareSheet on the result
// detail screen.
//
// What it does:
//   1. Re-renders the AI-generated image with one of N tinted filters
//      applied (Original / B&W / Sepia / Cool / Warm).
//   2. Lets the user save or share whatever look they've selected.
//   3. When the user picks a non-Original filter, save/share captures
//      the rendered View (image + overlay) to a JPEG via
//      react-native-view-shot, so the persisted/shared bytes match
//      what the user is looking at — not the un-filtered source.
//
// Why simple overlays rather than real shaders:
//   - True image filters require either Skia or a native module like
//     react-native-color-matrix-image-filters. Both add native build
//     complexity (and Skia adds ~3 MB to the bundle).
//   - Tinted overlay rectangles produce a "look-similar-to-a-filter"
//     effect with zero new native dependencies. They aren't perfectly
//     accurate (B&W with this approach is "muted color" not strictly
//     grayscale), but they read as filters and ship today.
//   - On WEB specifically, we ALSO apply CSS filter strings — those
//     give true grayscale/sepia/etc. The overlay still renders so the
//     visual result looks the same on every platform; on web the CSS
//     filter is the dominant effect, on native the overlay is.
//
// Capturing for share:
//   - When filter === 'none', save/share routes through the un-touched
//     original imageURL (cheaper, no capture step, identical bytes).
//   - When a real filter is active, captureRef writes the rendered View
//     to a temp PNG, and that file is the source for save/share.

import React, { useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { colors, layout, radii, spacing, typography } from '@/constants/theme';

type FilterId = 'none' | 'bw' | 'sepia' | 'cool' | 'warm';

interface FilterDef {
  id: FilterId;
  label: string;
  // Native-side overlay rectangle. `null` means no overlay (Original).
  overlay: { backgroundColor: string; opacity: number } | null;
  // Web-side CSS filter string. Same set of effects, expressed in the
  // browser's native filter pipeline so it reads as a "real" filter
  // rather than a tinted rectangle.
  cssFilter: string;
}

const FILTERS: FilterDef[] = [
  { id: 'none', label: 'Original', overlay: null, cssFilter: 'none' },
  { id: 'bw', label: 'B&W', overlay: { backgroundColor: '#7a7a7a', opacity: 0.55 }, cssFilter: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', label: 'Sepia', overlay: { backgroundColor: '#704214', opacity: 0.32 }, cssFilter: 'sepia(0.85) contrast(1.05)' },
  { id: 'cool', label: 'Cool', overlay: { backgroundColor: '#1e88e5', opacity: 0.22 }, cssFilter: 'hue-rotate(-20deg) saturate(1.1) brightness(1.02)' },
  { id: 'warm', label: 'Warm', overlay: { backgroundColor: '#ff8a00', opacity: 0.22 }, cssFilter: 'hue-rotate(15deg) saturate(1.15) brightness(1.05)' },
];

interface FilteredResultPanelProps {
  imageURL: string;
  categoryLabel: string;
  subcategoryLabel: string;
}

export function FilteredResultPanel({
  imageURL,
  categoryLabel,
  subcategoryLabel,
}: FilteredResultPanelProps) {
  const [filter, setFilter] = useState<FilterId>('none');
  const [busy, setBusy] = useState(false);
  const captureRefHandle = useRef<View>(null);
  const { show } = useToast();

  const filterDef = FILTERS.find((f) => f.id === filter)!;

  // Build a clean filename from the labels + filter id so saved files
  // reflect what the user picked. Mirrors the buildFilename helper in
  // ShareSheet but adds the filter suffix.
  const buildFilename = () => {
    const slug = `${categoryLabel}-${subcategoryLabel}-${filter}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `whatif-${slug || Date.now()}.jpg`;
  };

  /**
   * Resolve the URI to save/share based on the current filter:
   *   - `none` → return imageURL as-is (no capture step needed)
   *   - other → captureRef to a temp file and return that local URI
   *
   * captureRef returns a `file://` URI on native, and a `data:` URI
   * (or blob URL depending on the platform) on web. Both downstream
   * code paths (Sharing.shareAsync, anchor.download) handle either.
   */
  const resolveExportUri = async (): Promise<string> => {
    if (filter === 'none') return imageURL;
    if (!captureRefHandle.current) {
      throw new Error('Filter capture target not ready yet.');
    }
    return await captureRef(captureRefHandle.current, {
      format: 'jpg',
      quality: 0.92,
      // On web captureRef returns a data URI by default; on native it
      // returns a temporary file path. Both are usable by our save/
      // share flows below.
      result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
    });
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await resolveExportUri();
      const filename = buildFilename();
      if (Platform.OS === 'web') {
        // Programmatic anchor download. Same trick the ShareSheet uses
        // for un-filtered downloads, but works for both URLs and data
        // URIs without any fetch step (since captureRef already gave
        // us a same-origin data URI for non-Original filters).
        const a = document.createElement('a');
        a.href = uri;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        show('Saved to Downloads', 'success');
        return;
      }
      // Native: write to documentDirectory. Same boundary the
      // ShareSheet's handleSave uses.
      const dir = FileSystem.documentDirectory;
      if (!dir) throw new Error('No document directory available.');
      const dest = `${dir}${filename}`;
      // captureRef gave us a tmpfile URI; on un-filtered runs it's the
      // network/data URL. Either way, downloadAsync handles both.
      if (filter === 'none') {
        await FileSystem.downloadAsync(uri, dest);
      } else {
        await FileSystem.copyAsync({ from: uri, to: dest });
      }
      Alert.alert('Saved', 'Image saved to app storage.');
    } catch (e) {
      Alert.alert(
        'Save failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await resolveExportUri();
      const filename = buildFilename();
      if (Platform.OS === 'web') {
        // Web Share API path. Captured filter already gave us a data
        // URI; convert to a File and ask the browser to share it.
        try {
          const res = await fetch(uri);
          const blob = await res.blob();
          const file = new File([blob], filename, {
            type: blob.type || 'image/jpeg',
          });
          const navAny = navigator as any;
          if (navAny.canShare?.({ files: [file] })) {
            await navAny.share({
              files: [file],
              title: 'What If',
              text: `What If — ${categoryLabel}: ${subcategoryLabel}`,
            });
            return;
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
        }
        // Fallback: just download it.
        const a = document.createElement('a');
        a.href = uri;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        show('Downloaded — share from your Downloads folder', 'success');
        return;
      }
      // Native: stage in cache + open system share sheet.
      const dir = FileSystem.cacheDirectory;
      if (!dir) throw new Error('No cache directory available.');
      const dest = `${dir}${filename}`;
      if (filter === 'none') {
        await FileSystem.downloadAsync(uri, dest);
      } else {
        await FileSystem.copyAsync({ from: uri, to: dest });
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable on this device.');
        return;
      }
      await Sharing.shareAsync(dest, {
        dialogTitle: `What If — ${categoryLabel}: ${subcategoryLabel}`,
        mimeType: 'image/jpeg',
      });
    } catch (e) {
      Alert.alert(
        'Share failed',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Customize</Text>
      <Text style={styles.title}>Pick a look</Text>

      {/*
        The View we capture. Wrapped tightly around just the image +
        overlay so captureRef doesn't accidentally include the filter
        chips or section header. CSS-filter on web is applied directly
        to the Image's style; native uses an overlay.
      */}
      <View ref={captureRefHandle} collapsable={false} style={styles.imageWrap}>
        <Image
          source={{ uri: imageURL }}
          style={[
            styles.image,
            // RNW supports `filter` via the standard React style object.
            // Native silently ignores it. We keep the type cast minimal
            // so the IDE doesn't complain on either platform.
            Platform.OS === 'web'
              ? ({ filter: filterDef.cssFilter } as Record<string, unknown>)
              : null,
          ]}
          resizeMode="cover"
        />
        {Platform.OS !== 'web' && filterDef.overlay ? (
          <View
            style={[StyleSheet.absoluteFillObject, filterDef.overlay]}
            pointerEvents="none"
          />
        ) : null}
      </View>

      {/* Filter chip row. Horizontal scrolling not needed — five chips
          fit on every realistic screen width. */}
      <View style={styles.chipRow}>
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          label={busy ? 'Saving…' : 'Save'}
          variant="secondary"
          onPress={handleSave}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <Button
          label={busy ? 'Sharing…' : 'Share'}
          onPress={handleShare}
          disabled={busy}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  sectionLabel: {
    ...typography.label,
    color: colors.textLabel,
    fontSize: 10,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  imageWrap: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
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
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: { color: colors.accentText, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
