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
 *
 * Returns `"download"` when we successfully triggered a same-origin download
 * (blob URL or data URI — browser honors the `download` attribute), or
 * `"newtab"` when we had to fall back to opening the raw URL in a new tab
 * because fetch was blocked by CORS. The caller uses this to pick the right
 * toast copy — claiming "Saved to Downloads" after a new-tab open would be
 * a lie.
 */
type DownloadOutcome = 'download' | 'newtab';

async function downloadOnWeb(imageURL: string, filename: string): Promise<DownloadOutcome> {
  // Preferred path: fetch the bytes ourselves, wrap in a blob URL, and use
  // an anchor with `download` set. Blob URLs are same-origin to the page,
  // so the `download` attribute is honored and the file lands in Downloads
  // with the name we picked. This also handles `data:` URIs transparently
  // (fetch supports them).
  try {
    const res = await fetch(imageURL);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return 'download';
  } catch {
    // Fetch failed — almost always CORS on Firebase Storage download URLs
    // (the bucket doesn't send permissive CORS headers for the page's
    // origin). Falling back to an anchor pointed at the raw URL is NOT
    // safe: browsers ignore the `download` attribute on cross-origin
    // hrefs, so clicking navigates the current tab to the image URL and
    // the user loses the app (no back button in a packaged web view).
    //
    // Instead, open it in a NEW tab. The user can right-click → Save As
    // from there, and their app session stays intact.
    const win = window.open(imageURL, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked. Surface as an error so the caller can toast.
      throw new Error('Pop-up blocked — allow pop-ups to save this image.');
    }
    return 'newtab';
  }
}

export function ShareSheet({ imageURL, categoryLabel, subcategoryLabel }: ShareSheetProps) {
  const { show } = useToast();

  const handleSave = async () => {
    const filename = buildFilename(categoryLabel, subcategoryLabel);

    if (Platform.OS === 'web') {
      try {
        const outcome = await downloadOnWeb(imageURL, filename);
        show(
          outcome === 'download'
            ? 'Saved to Downloads'
            : 'Opened in a new tab — right-click the image and choose Save As',
          'success',
        );
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
        const outcome = await downloadOnWeb(imageURL, filename);
        show(
          outcome === 'download'
            ? 'Downloaded — share from your Downloads folder'
            : 'Opened in a new tab — right-click the image and choose Save As',
          'success',
        );
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
