import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';

interface Props {
  supported: boolean;
  enabled: boolean;
  onRecheck: () => void;
}

export function NfcStatusBadge({ supported, enabled, onRecheck }: Props) {
  const openNfcSettings = () => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.NFC_SETTINGS').catch(() =>
        Linking.openSettings(),
      );
    } else {
      Linking.openSettings();
    }
  };

  if (!supported) {
    return (
      <View style={[styles.badge, styles.error]}>
        <Text style={styles.icon}>✗</Text>
        <Text style={styles.text}>NFC not supported on this device</Text>
      </View>
    );
  }

  if (!enabled) {
    return (
      <TouchableOpacity
        style={[styles.badge, styles.warning]}
        onPress={openNfcSettings}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>⚠</Text>
        <Text style={styles.text}>NFC is off — tap to open Settings</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.badge, styles.ok]}>
      <Text style={styles.icon}>✓</Text>
      <Text style={styles.text}>NFC ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'flex-start',
  },
  ok: { backgroundColor: 'rgba(76,175,80,0.15)', borderWidth: 1, borderColor: '#4CAF50' },
  warning: { backgroundColor: 'rgba(255,152,0,0.15)', borderWidth: 1, borderColor: '#FF9800' },
  error: { backgroundColor: 'rgba(229,57,53,0.15)', borderWidth: 1, borderColor: '#E53935' },
  icon: { fontSize: 14, color: '#fff' },
  text: { fontSize: 12, color: '#ccc', fontWeight: '500' },
});
