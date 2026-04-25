import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { config } from '@/constants/config';

export interface PickedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

/**
 * Extract base64 body (no `data:...;base64,` prefix) from an image URI on web.
 * Used as a fallback when expo-image-manipulator / expo-file-system don't
 * produce base64 on the web target.
 */
async function uriToBase64Web(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Shared post-pick pipeline: resize to config.maxImageSize on the longest
 * edge, JPEG-compress to config.imageQuality, and recover base64 across
 * web/native via a fallback chain. Both pick (gallery) and capture
 * (camera) feed through this — a Nano Banana call doesn't care which
 * source the bytes came from, so the downstream shape stays identical.
 */
async function processAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  const scale = longest > config.maxImageSize ? config.maxImageSize / longest : 1;
  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    scale < 1
      ? [{ resize: { width: Math.round((asset.width ?? 0) * scale) } }]
      : [],
    { compress: config.imageQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  let base64 = manipulated.base64 ?? '';

  // Fallback chain:
  //   1. manipulator produced base64 → use it
  //   2. native → ask expo-file-system
  //   3. web → fetch(uri) + FileReader
  if (!base64) {
    try {
      if (Platform.OS === 'web') {
        base64 = await uriToBase64Web(manipulated.uri);
      } else {
        base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch (e) {
      console.warn('[useImagePicker] base64 fallback failed, trying opposite path', e);
      // Last-ditch: try the other method.
      try {
        base64 = await uriToBase64Web(manipulated.uri);
      } catch (e2) {
        console.warn('[useImagePicker] last-ditch base64 failed', e2);
      }
    }
  }

  if (!base64) {
    throw new Error('Could not read image bytes — pick a different photo.');
  }

  return {
    uri: manipulated.uri,
    base64,
    width: manipulated.width,
    height: manipulated.height,
  };
}

export function useImagePicker() {
  const pick = useCallback(async (): Promise<PickedImage | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return processAsset(result.assets[0]);
  }, []);

  // Capture from the device camera. Mirrors `pick` but routes through
  // launchCameraAsync + camera permission. Returned shape is identical
  // so callers can treat both sources interchangeably.
  //
  // Web caveat: launchCameraAsync on web shells to a hidden <input
  // capture> element whose behavior varies wildly across browsers (some
  // open the camera, some open the library, some no-op). The PhotoUploader
  // hides the "Take photo" button on web for that reason — calling
  // capture() on web isn't *broken*, it's just unreliable, so we don't
  // expose it there.
  const capture = useCallback(async (): Promise<PickedImage | null> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return processAsset(result.assets[0]);
  }, []);

  return { pick, capture };
}
