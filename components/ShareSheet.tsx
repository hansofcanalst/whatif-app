import React from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

interface ShareSheetProps {
  imageURL: string;
  categoryLabel: string;
  subcategoryLabel: string;
}

/**
 * Build a clean filename from the labels. Falls back to a timestamp.
 */
function buildFilename(categoryLabel: string, subcategoryLabel: string): string {
  const slug = `${categoryLabel}-${subcategoryLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `whatif-${slug || Date.now()}.jpg`;
}

/**
 * Trigger a browser-native download of an image URL (or data URI) on web.
 * Works with Firebase Storage download URLs AND `data:` URIs.
 */
async function downloadOnWeb(imageURL: string, filename: string): Promise<void> {
  // Fetch first so we can force a `download` attribute regardless of
  // cross-origin headers. If the fetch fails (CORS), fall back to a
  // direct anchor click — browser will at least open the image.
  let href = imageURL;
  let objectUrl: string | null = null;
  try {
    const res = await fetch(imageURL);
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    href = objectUrl;
  } catch {
    // keep href = imageURL; anchor download still works for same-origin + data URIs
  }

  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

export function ShareSheet({ imageURL, categoryLabel, subcategoryLabel }: ShareSheetProps) {
  const { show } = useToast();

  const handleSave = async () => {
    const filename = buildFilename(categoryLabel, subcategoryLabel);

    if (Platform.OS === 'web') {
      try {
        await downloadOnWeb(imageURL, filename);
        show('Saved to Downloads', 'success');
      } catch (e) {
        show(
          'Save failed: ' + (e instanceof Error ? e.message : 'unknown error'),
          'error',
        );
      }
      return;
    }

    // Native: write to app's documentDirectory. Note this is sandboxed storage,
    // not the camera roll — for camera roll, expo-media-library is needed.
    try {
      const dir = FileSystem.documentDirectory;
      if (!dir) throw new Error('No document directory available on this platform.');
      const localPath = `${dir}${filename}`;
      await FileSystem.downloadAsync(imageURL, localPath);
      Alert.alert('Saved', 'Image saved to app storage.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleShare = async () => {
    const filename = buildFilename(categoryLabel, subcategoryLabel);

    if (Platform.OS === 'web') {
      // Try the native Web Share API with a File — supported on iOS Safari
      // and most Android browsers. Desktop browsers usually don't support
      // file sharing; fall back to download.
      try {
        const res = await fetch(imageURL);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
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
        // User cancelled or browser refused — fall through to download fallback.
        if (e?.name === 'AbortError') return;
      }
      // Fallback: just download it so the user has something to share.
      try {
        await downloadOnWeb(imageURL, filename);
        show('Downloaded — share from your Downloads folder', 'success');
      } catch (e) {
        show(
          'Share failed: ' + (e instanceof Error ? e.message : 'unknown error'),
          'error',
        );
      }
      return;
    }

    // Native: stage to cache dir, then open the system share sheet.
    try {
      const dir = FileSystem.cacheDirectory;
      if (!dir) throw new Error('No cache directory available.');
      const localPath = `${dir}${filename}`;
      const download = await FileSystem.downloadAsync(imageURL, localPath);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable on this device.');
        return;
      }
      await Sharing.shareAsync(download.uri, {
        dialogTitle: `What If — ${categoryLabel}: ${subcategoryLabel}`,
        mimeType: 'image/jpeg',
      });
    } catch (e) {
      Alert.alert('Sharing failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <View style={styles.row}>
      <Button label="Save" variant="secondary" onPress={handleSave} style={{ flex: 1 }} />
      <Button label="Share" onPress={handleShare} style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
});
