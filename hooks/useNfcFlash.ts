/**
 * useNfcFlash.ts
 *
 * Custom hook that manages:
 *   - NFC availability check on mount
 *   - Image selection + processing pipeline
 *   - Transfer session state machine
 *   - Progress reporting
 */

import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import NfcManager from "react-native-nfc-manager";

import { DEFAULT_DISPLAY } from "@/constants";
import { processImageForDisplay } from "@/lib/imageProcessor";
import { NfcTransferEngine } from "@/lib/nfcTransfer";
import {
  DisplayConfig,
  ProcessedImage,
  SelectedImage,
  TransferProgress,
} from "@/types";

// ─── Hook State ────────────────────────────────────────────────────────────────

interface UseNfcFlashState {
  /** Whether the device has an NFC chip */
  nfcSupported: boolean;
  /** Whether NFC is enabled in device settings */
  nfcEnabled: boolean;
  /** Currently selected source image */
  selectedImage: SelectedImage | null;
  /** Processed bitmap (ready to send) */
  processedImage: ProcessedImage | null;
  /** Whether image processing is running */
  isProcessing: boolean;
  /** Whether a transfer is in progress */
  isTransferring: boolean;
  /** Latest progress snapshot */
  progress: TransferProgress;
  /** Last error message */
  error: string | null;
}

interface UseNfcFlashActions {
  pickImage: () => Promise<void>;
  takePhoto: () => Promise<void>;
  startFlash: () => Promise<void>;
  reset: () => void;
  checkNfc: () => Promise<void>;
}

const initialProgress: TransferProgress = {
  stage: "init",
  percent: 0,
  currentPacket: 0,
  totalPackets: 0,
  message: "Ready",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNfcFlash(config: DisplayConfig = DEFAULT_DISPLAY) {
  const [state, setState] = useState<UseNfcFlashState>({
    nfcSupported: false,
    nfcEnabled: false,
    selectedImage: null,
    processedImage: null,
    isProcessing: false,
    isTransferring: false,
    progress: initialProgress,
    error: null,
  });

  const engineRef = useRef(new NfcTransferEngine(config));
  const abortRef = useRef(false);

  // ── NFC availability check ─────────────────────────────────────────────────

  const checkNfc = useCallback(async () => {
    try {
      const supported = await NfcManager.isSupported();
      if (supported) {
        await NfcManager.start();
        const enabled = await NfcManager.isEnabled();
        setState((s) => ({ ...s, nfcSupported: true, nfcEnabled: enabled }));
      } else {
        setState((s) => ({ ...s, nfcSupported: false, nfcEnabled: false }));
      }
    } catch (e) {
      setState((s) => ({ ...s, nfcSupported: false, nfcEnabled: false }));
    }
  }, []);

  useEffect(() => {
    checkNfc();
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, [checkNfc]);

  // ── Image selection ────────────────────────────────────────────────────────

  const _handlePickedImage = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const selected: SelectedImage = {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      };

      setState((s) => ({
        ...s,
        selectedImage: selected,
        processedImage: null,
        isProcessing: true,
        error: null,
        progress: { ...initialProgress, message: "Processing image…" },
      }));

      try {
        const processed = await processImageForDisplay(asset.uri, config);
        setState((s) => ({
          ...s,
          processedImage: processed,
          isProcessing: false,
          progress: {
            ...initialProgress,
            message: `Ready — tap "Flash to Tag" and hold phone to the display`,
          },
        }));
      } catch (e: any) {
        setState((s) => ({
          ...s,
          isProcessing: false,
          error: `Image processing failed: ${e.message}`,
        }));
      }
    },
    [config],
  );

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library in Settings.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 1,
      allowsEditing: true,
      // Crop to display aspect ratio (122:250 ≈ 0.488)
      aspect: [config.width, config.height],
    });
    await _handlePickedImage(result);
  }, [_handlePickedImage, config]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow camera access in Settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 1,
      allowsEditing: true,
      aspect: [config.width, config.height],
    });
    await _handlePickedImage(result);
  }, [_handlePickedImage, config]);

  // ── NFC flash ──────────────────────────────────────────────────────────────

  const startFlash = useCallback(async () => {
    if (!state.processedImage) {
      Alert.alert("No image", "Please select or take a photo first.");
      return;
    }
    if (!state.nfcEnabled) {
      Alert.alert(
        "NFC disabled",
        Platform.OS === "android"
          ? "Please enable NFC in your device Settings → Connected devices → NFC."
          : "Please enable NFC in Settings → General → NFC.",
      );
      return;
    }

    abortRef.current = false;
    setState((s) => ({
      ...s,
      isTransferring: true,
      error: null,
      progress: { ...initialProgress, message: "Starting NFC session…" },
    }));

    try {
      await engineRef.current.flashImage(state.processedImage, (progress) => {
        if (!abortRef.current) {
          setState((s) => ({ ...s, progress }));
        }
      });
    } catch (e: any) {
      setState((s) => ({
        ...s,
        error: e.message ?? "Transfer failed",
        progress: {
          stage: "error",
          percent: 0,
          currentPacket: 0,
          totalPackets: 0,
          message: e.message ?? "Transfer failed",
          error: e.message,
        },
      }));
    } finally {
      setState((s) => ({ ...s, isTransferring: false }));
    }
  }, [state.processedImage, state.nfcEnabled]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current = true;
    NfcManager.cancelTechnologyRequest().catch(() => {});
    setState((s) => ({
      ...s,
      selectedImage: null,
      processedImage: null,
      isProcessing: false,
      isTransferring: false,
      error: null,
      progress: initialProgress,
    }));
  }, []);

  return { state, pickImage, takePhoto, startFlash, reset, checkNfc };
}
