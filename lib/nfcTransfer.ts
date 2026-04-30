/**
 * nfcTransfer.ts
 *
 * Manages the full NFC session for flashing an image to a GoodDisplay ESL tag.
 *
 * Android path: Direct ISO-DEP APDU transceive (NfcTech.IsoDep)
 * iOS path:     NDEF file write wrapper (Section 6 of the manual)
 *
 * Usage:
 *   const engine = new NfcTransferEngine(config);
 *   await engine.flashImage(processedImage, onProgress);
 */

import { Platform } from "react-native";
import NfcManager, { NfcTech } from "react-native-nfc-manager";

import {
  buildGetEpdBusyStatus,
  buildLoadImageCommands,
  buildRedrawScreen,
  buildSelectNdefApp,
  buildSetScreenType,
  buildVerifyPin,
  parseApduResponse,
} from "./apduCommands";

import {
  BUSY_POLL_INTERVAL_MS,
  DEFAULT_PIN,
  REFRESH_TIMEOUT_MS,
} from "../constants";

import { DisplayConfig, ProcessedImage, TransferProgress } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProgressCallback = (progress: TransferProgress) => void;

// ─── Engine ───────────────────────────────────────────────────────────────────

export class NfcTransferEngine {
  private config: DisplayConfig;

  constructor(config: DisplayConfig) {
    this.config = config;
  }

  /**
   * Main entry point. Starts an NFC session and flashes the image.
   * Call from a button handler; keep the phone touching the tag throughout.
   */
  async flashImage(
    image: ProcessedImage,
    onProgress: ProgressCallback,
    imageIndex: number = 0,
  ): Promise<void> {
    try {
      await NfcManager.start();
    } catch {
      // Already started — fine to ignore
    }

    if (Platform.OS === "android") {
      await this._flashAndroid(image, onProgress, imageIndex);
    } else {
      await this._flashIos(image, onProgress, imageIndex);
    }
  }

  private hexToBytes = (hex: string): number[] => {
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex string");
    }

    const bytes: number[] = [];

    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }

    return bytes;
  };

  private sendImage = async (buffer: number[], transceive: any) => {
    const chunkSize = 250;
    const totalChunks = Math.ceil(buffer.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      let chunk = buffer.slice(i * chunkSize, (i + 1) * chunkSize);

      // pad last chunk
      while (chunk.length < 250) {
        chunk.push(0xff);
      }

      const packet = [0xf0, 0xd2, 0x00, i, 0xfa, ...chunk];

      await transceive(packet);

      // small delay (important)
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  // ─── Android: Direct ISO-DEP ────────────────────────────────────────────────

  // private async _flashAndroid(
  //   image: ProcessedImage,
  //   onProgress: ProgressCallback,
  //   imageIndex: number,
  // ): Promise<void> {
  //   console.log(this.hexToBytes("F0DA"));
  //   try {
  //     onProgress({
  //       stage: "init",
  //       percent: 0,
  //       currentPacket: 0,
  //       totalPackets: 0,
  //       message: "Hold phone steady against the tag…",
  //     });

  //     await NfcManager.requestTechnology(NfcTech.IsoDep, {
  //       alertMessage: "Hold your phone against the e-paper tag",
  //     });

  //     const tag = await NfcManager.getTag();
  //     if (!tag)
  //       throw new Error("No NFC tag detected. Try repositioning the phone.");

  //     // ── Step 0: SELECT NDEF APPLICATION ───────────────────────────────────
  //     // MANDATORY: The FMSC chip requires the NDEF application to be selected
  //     // before it will accept any proprietary ESL commands (INS 0x20, 0xDA, etc.)
  //     // Without this step, every subsequent command returns SW 6D 00 ("INS not supported").
  //     // Ref: Section 6 of the FMSC ESL User Development Manual.
  //     onProgress({
  //       stage: "init",
  //       percent: 3,
  //       currentPacket: 0,
  //       totalPackets: 0,
  //       message: "Selecting application…",
  //     });
  //     // try {
  //     //   await this._transceiveChecked(buildSelectNdefApp(), "SELECT NDEF APP");
  //     // } catch (e: any) {
  //     //   throw new Error(
  //     //     `Application select failed (${e.message}). ` +
  //     //       "Verify this is a GoodDisplay FMSC ESL tag.",
  //     //   );
  //     // }

  //     // ── Step 1: VERIFY PIN ────────────────────────────────────────────────
  //     // Required before any F0-class (proprietary) command.
  //     // If USER PIN is disabled in the tag config, this step still succeeds
  //     // (the chip accepts it and ignores it). Default PIN: 1122334455.
  //     onProgress({
  //       stage: "init",
  //       percent: 8,
  //       currentPacket: 0,
  //       totalPackets: 0,
  //       message: "Authenticating…",
  //     });
  //     // try {
  //     //   await this._transceiveChecked(
  //     //     buildVerifyPin(DEFAULT_PIN),
  //     //     "VERIFY PIN",
  //     //   );
  //     // } catch (e: any) {
  //     //   throw new Error(
  //     //     `PIN authentication failed (${e.message}). ` +
  //     //       "Check that the PIN has not been changed from the factory default.",
  //     //   );
  //     // }

  //     // ── Step 2: SET SCREEN TYPE (DA) ──────────────────────────────────────
  //     onProgress({
  //       stage: "init",
  //       percent: 12,
  //       currentPacket: 0,
  //       totalPackets: 0,
  //       message: "Configuring display type…",
  //     });
  //     // const daCommands = buildSetScreenType(
  //     //   this.config.manufacturerByte,
  //     //   this.config.sizeByte,
  //     //   this.config.colorByte,
  //     // );
  //     // for (let i = 0; i < daCommands.length; i++) {
  //     //   try {
  //     //     await this._transceiveChecked(
  //     //       daCommands[i],
  //     //       `SET SCREEN TYPE [${i}]`,
  //     //     );
  //     //   } catch (e: any) {
  //     //     throw new Error(
  //     //       `Screen type config failed at command ${i}: ${e.message}`,
  //     //     );
  //     //   }
  //     // }
  //     await this._transceiveChecked(
  //       this.hexToBytes("F0DA000003700020"),
  //       "SET SCREEN TYPE[1]",
  //     );

  //     // ── Step 3: LOAD IMAGE PACKETS (D2) ───────────────────────────────────
  //     const blackPackets = buildLoadImageCommands(
  //       imageIndex,
  //       image.blackBitmap,
  //     );
  //     const redPackets = image.redBitmap
  //       ? buildLoadImageCommands(imageIndex + 1, image.redBitmap)
  //       : [];

  //     const allPackets = [...blackPackets, ...redPackets];
  //     const total = allPackets.length;

  //     for (let i = 0; i < allPackets.length; i++) {
  //       const percent = 15 + Math.round((i / total) * 65);
  //       onProgress({
  //         stage: "uploading",
  //         percent,
  //         currentPacket: i + 1,
  //         totalPackets: total,
  //         message: `Uploading packet ${i + 1} of ${total}…`,
  //       });
  //       try {
  //         await this._transceiveChecked(allPackets[i], `LOAD IMAGE pkt ${i}`);
  //       } catch (e: any) {
  //         throw new Error(
  //           `Image upload failed at packet ${i + 1}/${total}: ${e.message}`,
  //         );
  //       }
  //     }

  //     // ── Step 4: REDRAW SCREEN (D4) ────────────────────────────────────────
  //     onProgress({
  //       stage: "refreshing",
  //       percent: 82,
  //       currentPacket: total,
  //       totalPackets: total,
  //       message: "Triggering screen refresh…",
  //     });
  //     try {
  //       // immediate-return mode (P2 bit7=1) so we can poll and show progress
  //       const redrawCmd = buildRedrawScreen(imageIndex, false, 0x00);
  //       await this._transceiveChecked(redrawCmd, "REDRAW SCREEN");
  //     } catch (e: any) {
  //       throw new Error(`Screen refresh trigger failed: ${e.message}`);
  //     }

  //     // ── Step 5: POLL BUSY STATUS (DE) ─────────────────────────────────────
  //     await this._pollUntilIdle(onProgress, total);

  //     onProgress({
  //       stage: "done",
  //       percent: 100,
  //       currentPacket: total,
  //       totalPackets: total,
  //       message: "Display updated successfully! ✓",
  //     });
  //   } finally {
  //     NfcManager.cancelTechnologyRequest().catch(() => {});
  //   }
  // }
  private async _flashAndroid(
    image: ProcessedImage,
    onProgress: ProgressCallback,
    imageIndex: number,
  ) {
    console.log("Starting flash...");

    await NfcManager.requestTechnology(NfcTech.IsoDep);

    const isoDep = NfcManager.isoDepHandler;

    const transceive = async (bytes: number[]) => {
      const response = await isoDep.transceive(bytes);
      return response;
    };

    try {
      // -------------------------
      // STEP 1: SET SCREEN TYPE
      // -------------------------

      await transceive(this.hexToBytes("F0DA000003700020"));
      await transceive(this.hexToBytes("F0DA000103120030"));

      console.log("Screen configured");

      // -------------------------
      // STEP 2: DUMMY IMAGE
      // -------------------------

      const buffer: number[] = new Array(3800).fill(0x00);

      for (let i = 0; i < 3800; i++) {
        buffer.push(i % 2 === 0 ? 0x00 : 0xff);
      }

      // -------------------------
      // STEP 3: SEND IMAGE
      // -------------------------

      await this.sendImage(buffer, transceive);

      console.log("Image sent");

      // -------------------------
      // STEP 4: REDRAW
      // -------------------------

      await transceive(this.hexToBytes("F0D40000"));

      // Just wait fixed time (much safer for now)
      await new Promise((r) => setTimeout(r, 3000));

      console.log("Screen refresh completed");
    } catch (e) {
      console.error("Flash failed:", e);
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
  }

  // ─── iOS: NDEF file write wrapper (Section 6) ───────────────────────────────
  // Apple does not allow raw ISO-DEP transceive without a special entitlement
  // from Apple. We use the NDEF write path described in Section 6 of the manual:
  //   1. Tag connects via NfcTech.IsoDep (iOS 13+ supports this for non-payment tags)
  //   2. Manually run the NDEF file selection sequence
  //   3. Write APDU into NDEF data bytes, then write file length to trigger execution
  //   4. Read back result from NDEF file

  private async _flashIos(
    image: ProcessedImage,
    onProgress: ProgressCallback,
    imageIndex: number,
  ): Promise<void> {
    try {
      onProgress({
        stage: "init",
        percent: 0,
        currentPacket: 0,
        totalPackets: 0,
        message: "Hold phone steady against the tag…",
      });

      // iOS supports IsoDep for non-payment NFC tags on iPhone 7+ / iOS 13+
      await NfcManager.requestTechnology(NfcTech.IsoDep, {
        alertMessage: "Hold your phone against the e-paper tag",
      });

      // ── Step 0: SELECT NDEF APPLICATION ───────────────────────────────────
      onProgress({
        stage: "init",
        percent: 3,
        currentPacket: 0,
        totalPackets: 0,
        message: "Selecting application…",
      });
      await this._transceiveChecked(
        buildSelectNdefApp(),
        "SELECT NDEF APP (iOS)",
      );

      // ── Steps 1-4: same as Android via ISO-DEP ─────────────────────────────
      // iOS 13+ with CoreNFC entitlement supports full ISO-DEP transceive.
      // If you do NOT have the entitlement, this will fail at requestTechnology
      // and you need to fall back to NfcTech.Ndef (NDEF write path only).

      onProgress({
        stage: "init",
        percent: 8,
        currentPacket: 0,
        totalPackets: 0,
        message: "Authenticating…",
      });
      await this._transceiveChecked(
        buildVerifyPin(DEFAULT_PIN),
        "VERIFY PIN (iOS)",
      );

      const daCommands = buildSetScreenType(
        this.config.manufacturerByte,
        this.config.sizeByte,
        this.config.colorByte,
      );
      for (let i = 0; i < daCommands.length; i++) {
        await this._transceiveChecked(
          daCommands[i],
          `SET SCREEN TYPE [${i}] (iOS)`,
        );
      }

      const blackPackets = buildLoadImageCommands(
        imageIndex,
        image.blackBitmap,
      );
      const redPackets = image.redBitmap
        ? buildLoadImageCommands(imageIndex + 1, image.redBitmap)
        : [];
      const allPackets = [...blackPackets, ...redPackets];
      const total = allPackets.length;

      for (let i = 0; i < allPackets.length; i++) {
        onProgress({
          stage: "uploading",
          percent: 15 + Math.round((i / total) * 65),
          currentPacket: i + 1,
          totalPackets: total,
          message: `Uploading packet ${i + 1} of ${total}…`,
        });
        await this._transceiveChecked(
          allPackets[i],
          `LOAD IMAGE pkt ${i} (iOS)`,
        );
      }

      onProgress({
        stage: "refreshing",
        percent: 82,
        currentPacket: total,
        totalPackets: total,
        message: "Triggering screen refresh… keep holding",
      });

      // Use wait mode on iOS (P2 bit7=0) — blocks until display is done
      // so we don't need to poll DE separately
      const redrawCmd = buildRedrawScreen(imageIndex, true, 0x00);
      await this._transceiveChecked(redrawCmd, "REDRAW SCREEN (iOS)");

      onProgress({
        stage: "done",
        percent: 100,
        currentPacket: total,
        totalPackets: total,
        message: "Display updated successfully! ✓",
      });
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async _transceiveChecked(
    command: number[],
    label = "APDU",
  ): Promise<number[]> {
    const raw = await NfcManager.isoDepHandler.transceive(command);

    await new Promise((res) => setTimeout(res, 60));

    const resp = parseApduResponse(Array.from(raw));
    if (!resp.success) {
      const sw1hex = resp.sw1.toString(16).toUpperCase().padStart(2, "0");
      const sw2hex = resp.sw2.toString(16).toUpperCase().padStart(2, "0");
      throw new Error(
        `[${label}] SW=${sw1hex}${sw2hex} — ${swDescription(resp.sw1, resp.sw2)}`,
      );
    }
    return resp.data;
  }

  private async _ndefWriteApdu(apdu: number[]): Promise<void> {
    // Build NDEF message wrapping the APDU as a MIME record (Section 6.2)
    const ndefRecord = buildNdefApduRecord(apdu);
    await NfcManager.ndefHandler.writeNdefMessage([ndefRecord]);
  }

  private async _pollUntilIdle(
    onProgress: ProgressCallback,
    totalPackets: number,
  ): Promise<void> {
    const deadline = Date.now() + REFRESH_TIMEOUT_MS;
    let dots = 0;

    while (Date.now() < deadline) {
      await sleep(BUSY_POLL_INTERVAL_MS);
      try {
        const busyCmd = buildGetEpdBusyStatus();
        const raw = await NfcManager.isoDepHandler.transceive(busyCmd);
        const resp = parseApduResponse(Array.from(raw));
        if (resp.success && resp.data[0] === 0x00) {
          return; // Screen is idle — refresh complete
        }
      } catch {
        // Tag may have briefly lost contact — retry
      }
      dots = (dots + 1) % 4;
      const dotStr = ".".repeat(dots + 1);
      onProgress({
        stage: "refreshing",
        percent:
          80 +
          Math.min(
            19,
            Math.round(
              ((Date.now() - (deadline - REFRESH_TIMEOUT_MS)) /
                REFRESH_TIMEOUT_MS) *
                19,
            ),
          ),
        currentPacket: totalPackets,
        totalPackets,
        message: `Refreshing display${dotStr}`,
      });
    }
    throw new Error(
      "Screen refresh timed out. The display may still update — check visually.",
    );
  }
}

// ─── NDEF Record Builder (iOS wrapper) ───────────────────────────────────────

/**
 * Wraps an APDU command in the NDEF mime application record format
 * described in Section 6.2 of the manual.
 *
 * Format (for payloads < 256 bytes):
 *   Offset 0: NDEF flag (0xD2)
 *   Offset 1: type length (0x01)
 *   Offset 2: payload length (N)
 *   Offset 3: type byte (0x65 = mime application)
 *   Offset 4..N+3: APDU bytes
 */
function buildNdefApduRecord(apdu: number[]): any {
  const payload = [
    0xd2, // NDEF flag: short record, not chunked, message begin+end
    0x01, // Type length
    apdu.length, // Payload length
    0x65, // Type: mime application ('e')
    ...apdu,
  ];

  // react-native-nfc-manager NdefRecord format
  return {
    tnf: 2, // TNF_MIME_MEDIA
    type: [0x65], // 'e'
    id: [],
    payload,
  };
}

// ─── Status Word → Human description ─────────────────────────────────────────
// Ref: Appendix A of the FMSC ESL User Development Manual

function swDescription(sw1: number, sw2: number): string {
  const key = (sw1 << 8) | sw2;
  const table: Record<number, string> = {
    0x9000: "Success",
    0x6300: "No information given",
    0x6982: "Security status not satisfied — PIN required or wrong",
    0x6983: "Authentication method blocked — PIN locked",
    0x6985: "Conditions of use not satisfied",
    0x6986: "Command not allowed — no current EF",
    0x6988: "Incorrect secure messaging data objects",
    0x6a80: "Incorrect parameters in data field",
    0x6a86: "Incorrect P1 or P2 parameter",
    0x6d00:
      "Instruction (INS) byte not supported or invalid — did you SELECT the NDEF app first?",
    0x6e00: "Class (CLA) byte not supported",
    0x6f00: "No precise diagnosis",
    0x6481: "Writing to EEPROM failed",
    0x6449: "Configuration area EEPROM error",
    0x6450: "Screen initialization data error",
    0x6451: "Screen initialization data contains error TAG",
    0x6452: "Screen initialization data contains incorrect data",
    0x6453: "Screen initialization data missing required option",
    0x6454: "Screen refresh failed",
    0x6455: "Screen reset failed",
    0x6800: "Function not supported",
    0x6881: "Logical channel not supported",
    0x6882: "Secure messaging not supported",
    0x6900: "Command not allowed",
  };
  return (
    table[key] ??
    `Unknown status word SW1=${sw1.toString(16)} SW2=${sw2.toString(16)}`
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
