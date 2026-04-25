import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NfcStatusBadge } from "@/components/NfcStatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { DEFAULT_DISPLAY } from "@/constants";
import { useNfcFlash } from "@/hooks/useNfcFlash";

export default function FlashScreen() {
  const { state, pickImage, takePhoto, startFlash, reset, checkNfc } =
    useNfcFlash(DEFAULT_DISPLAY);

  const {
    nfcSupported,
    nfcEnabled,
    selectedImage,
    processedImage,
    isProcessing,
    isTransferring,
    progress,
    error,
  } = state;

  const canFlash =
    !!processedImage && !isTransferring && !isProcessing && nfcEnabled;

  const handleFlash = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startFlash();
  };

  const handleReset = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>GoodDisplay ESL</Text>
          <Text style={styles.subtitle}>2.13" E-Paper Tag Flasher</Text>
          <NfcStatusBadge
            supported={nfcSupported}
            enabled={nfcEnabled}
            onRecheck={checkNfc}
          />
        </View>

        {/* Display info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Target Display</Text>
          <Text style={styles.infoLine}>GDN0213BW — 2.13" Black & White</Text>
          <Text style={styles.infoLine}>Resolution: 122 × 250 px</Text>
          <Text style={styles.infoLine}>Protocol: NFC ISO 14443-A (FMSC)</Text>
        </View>

        {/* Image preview */}
        <View style={styles.previewContainer}>
          {selectedImage ? (
            <>
              <Image
                source={{ uri: selectedImage.uri }}
                style={styles.preview}
                resizeMode="contain"
              />
              {isProcessing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#4A90D9" />
                  <Text style={styles.processingText}>Processing…</Text>
                </View>
              )}
              {processedImage && !isProcessing && (
                <View style={styles.readyBadge}>
                  <Text style={styles.readyText}>
                    ✓ Ready — {processedImage.blackBitmap.length} bytes
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.previewEmpty}>
              <Text style={styles.previewEmptyIcon}>🖼</Text>
              <Text style={styles.previewEmptyText}>
                No image selected{"\n"}
                <Text style={styles.previewEmptyHint}>
                  It will be resized to 122×250 px and converted to 1-bit bitmap
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* Image selection buttons */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={pickImage}
            disabled={isTransferring}
          >
            <Text style={styles.btnText}>📷 Photo Library</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={takePhoto}
            disabled={isTransferring}
          >
            <Text style={styles.btnText}>📸 Camera</Text>
          </TouchableOpacity>
        </View>

        {/* Flash button */}
        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            !canFlash && styles.btnDisabled,
          ]}
          onPress={handleFlash}
          disabled={!canFlash}
          activeOpacity={0.8}
        >
          {isTransferring ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnPrimaryText}>⚡ Flash to Tag</Text>
          )}
        </TouchableOpacity>

        {/* Transfer hint */}
        {isTransferring && (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              ☝️ Keep your phone steady against the tag.{"\n"}
              Do not move until the progress reaches 100%.
            </Text>
          </View>
        )}

        {/* Progress */}
        {(isTransferring ||
          progress.stage === "done" ||
          progress.stage === "error") && (
          <View style={styles.progressSection}>
            <ProgressBar progress={progress} visible={true} />
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Transfer Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>
              Tips:{"\n"}• Keep the phone flat against the center of the tag
              {"\n"}• Ensure NFC is enabled{"\n"}• Try slowing down the approach
              to the tag
            </Text>
          </View>
        )}

        {/* Success */}
        {progress.stage === "done" && !error && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>✅ Success!</Text>
            <Text style={styles.successText}>
              The e-paper display has been updated.
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={handleReset}
            >
              <Text style={styles.btnText}>Flash another image</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reset */}
        {selectedImage && progress.stage !== "done" && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleReset}
            disabled={isTransferring}
          >
            <Text style={styles.resetText}>✕ Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = "#4A90D9";
const BG = "#0a0a0a";
const CARD = "#141414";
const BORDER = "#2A2A2A";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: {
    padding: 20,
    gap: 16,
    paddingBottom: 60,
  },
  header: {
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  infoBox: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 3,
  },
  infoTitle: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoLine: {
    fontSize: 13,
    color: "#ccc",
  },
  previewContainer: {
    width: "100%",
    height: 250,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    alignSelf: "center",
    maxWidth: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  processingText: { color: "#fff", fontSize: 14 },
  readyBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "rgba(76,175,80,0.85)",
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  readyText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  previewEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 12,
  },
  previewEmptyIcon: { fontSize: 36 },
  previewEmptyText: {
    color: "#666",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  previewEmptyHint: { color: "#444", fontSize: 11 },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  btnSecondary: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    color: "#ccc",
    fontSize: 14,
    fontWeight: "500",
  },
  hintBox: {
    backgroundColor: "rgba(74,144,217,0.1)",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(74,144,217,0.3)",
  },
  hintText: {
    color: "#8BB8E8",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  progressSection: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  errorBox: {
    backgroundColor: "rgba(229,57,53,0.08)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(229,57,53,0.3)",
    gap: 8,
  },
  errorTitle: { color: "#E53935", fontWeight: "700", fontSize: 15 },
  errorText: { color: "#EF9A9A", fontSize: 13 },
  errorHint: { color: "#888", fontSize: 12, lineHeight: 20, marginTop: 4 },
  successBox: {
    backgroundColor: "rgba(76,175,80,0.08)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(76,175,80,0.3)",
    gap: 10,
    alignItems: "center",
  },
  successTitle: { color: "#4CAF50", fontWeight: "700", fontSize: 18 },
  successText: { color: "#A5D6A7", fontSize: 14, textAlign: "center" },
  resetBtn: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resetText: { color: "#555", fontSize: 13 },
});
