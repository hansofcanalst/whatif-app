import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Button } from './ui/Button';

interface ShareSheetProps {
  imageURL: string;
  categoryLabel: string;
  subcategoryLabel: string;
}

export function ShareSheet({ imageURL, categoryLabel, subcategoryLabel }: ShareSheetProps) {
  const handleShare = async () => {
    try {
      const localPath = `${FileSystem.cacheDirectory}whatif-share-${Date.now()}.jpg`;
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

  const handleSave = async () => {
    try {
      const localPath = `${FileSystem.documentDirectory}whatif-${Date.now()}.jpg`;
      await FileSystem.downloadAsync(imageURL, localPath);
      Alert.alert('Saved', 'Image saved to app storage.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error');
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
