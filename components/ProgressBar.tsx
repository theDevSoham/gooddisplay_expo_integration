import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { TransferProgress } from '../types';

interface Props {
  progress: TransferProgress;
  visible: boolean;
}

const STAGE_COLORS: Record<TransferProgress['stage'], string> = {
  init: '#4A90D9',
  uploading: '#5BA35B',
  refreshing: '#D4A017',
  done: '#4CAF50',
  error: '#E53935',
};

export function ProgressBar({ progress, visible }: Props) {
  if (!visible) return null;

  const color = STAGE_COLORS[progress.stage] ?? '#4A90D9';

  return (
    <View style={styles.container}>
      <View style={styles.trackBg}>
        <View
          style={[
            styles.fill,
            { width: `${progress.percent}%` as any, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.message}>{progress.message}</Text>
      {progress.totalPackets > 0 && (
        <Text style={styles.sub}>
          Packet {progress.currentPacket} / {progress.totalPackets}
        </Text>
      )}
      <Text style={styles.percent}>{progress.percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 4,
    gap: 8,
  },
  trackBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  message: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  sub: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  percent: {
    color: '#555',
    fontSize: 11,
    textAlign: 'right',
  },
});
