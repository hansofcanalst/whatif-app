import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { config } from '@/constants/config';

export interface PickedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
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

    const asset = result.assets[0];
    const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
    const scale = longest > config.maxImageSize ? config.maxImageSize / longest : 1;
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      scale < 1
        ? [{ resize: { width: Math.round((asset.width ?? 0) * scale) } }]
        : [],
      { compress: config.imageQuality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    let base64 = manipulated.base64;
    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    return {
      uri: manipulated.uri,
      base64,
      width: manipulated.width,
      height: manipulated.height,
    };
  }, []);

  return { pick };
}
