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

import NfcManager, { NfcTech, IsoDep } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

import {
  buildVerifyPin,
  buildSetScreenType,
  buildLoadImageCommands,
  buildRedrawScreen,
  buildGetEpdBusyStatus,
  parseApduResponse,
} from './apduCommands';

import {
  DEFAULT_PIN,
  BUSY_POLL_INTERVAL_MS,
  REFRESH_TIMEOUT_MS,
} from '../constants';

import { DisplayConfig, ProcessedImage, TransferProgress } from '../types';

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

    if (Platform.OS === 'android') {
      await this._flashAndroid(image, onProgress, imageIndex);
    } else {
      await this._flashIos(image, onProgress, imageIndex);
    }
  }

  // ─── Android: Direct ISO-DEP ────────────────────────────────────────────────

  private async _flashAndroid(
    image: ProcessedImage,
    onProgress: ProgressCallback,
    imageIndex: number,
  ): Promise<void> {
    try {
      onProgress({
        stage: 'init',
        percent: 0,
        currentPacket: 0,
        totalPackets: 0,
        message: 'Hold phone steady against the tag…',
      });

      await NfcManager.requestTechnology(NfcTech.IsoDep, {
        alertMessage: 'Hold your phone against the e-paper tag',
      });

      const tag = await NfcManager.getTag();
      if (!tag) throw new Error('No tag detected');

      // ── Step 1: Verify PIN ─────────────────────────────────────────────────
      onProgress({
        stage: 'init', percent: 5, currentPacket: 0, totalPackets: 0,
        message: 'Authenticating…',
      });
      await this._transceiveChecked(buildVerifyPin(DEFAULT_PIN));

      // ── Step 2: Set screen type ────────────────────────────────────────────
      onProgress({
        stage: 'init', percent: 10, currentPacket: 0, totalPackets: 0,
        message: 'Configuring display…',
      });
      const daCommands = buildSetScreenType(
        this.config.manufacturerByte,
        this.config.sizeByte,
        this.config.colorByte,
      );
      for (const cmd of daCommands) {
        await this._transceiveChecked(cmd);
      }

      // ── Step 3: Upload image packets ───────────────────────────────────────
      const blackPackets = buildLoadImageCommands(imageIndex, image.blackBitmap);
      const redPackets = image.redBitmap
        ? buildLoadImageCommands(imageIndex + 1, image.redBitmap)
        : [];

      const allPackets = [...blackPackets, ...redPackets];
      const total = allPackets.length;

      for (let i = 0; i < allPackets.length; i++) {
        const percent = 10 + Math.round((i / total) * 70);
        onProgress({
          stage: 'uploading',
          percent,
          currentPacket: i + 1,
          totalPackets: total,
          message: `Uploading packet ${i + 1} of ${total}…`,
        });
        await this._transceiveChecked(allPackets[i]);
      }

      // ── Step 4: Trigger screen refresh ────────────────────────────────────
      onProgress({
        stage: 'refreshing', percent: 80, currentPacket: total, totalPackets: total,
        message: 'Refreshing display… please keep holding',
      });

      // Use immediate-return mode so we can poll and show progress
      const redrawCmd = buildRedrawScreen(imageIndex, false, 0x00);
      await this._transceiveChecked(redrawCmd);

      // ── Step 5: Poll busy status ───────────────────────────────────────────
      await this._pollUntilIdle(onProgress, total);

      onProgress({
        stage: 'done', percent: 100, currentPacket: total, totalPackets: total,
        message: 'Display updated successfully!',
      });
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // ─── iOS: NDEF file write wrapper (Section 6) ───────────────────────────────
  // iOS does not allow raw ISO-DEP APDU transceive without special entitlements
  // that require contacting Apple. Instead we use the NDEF write mechanism
  // described in Section 6 of the manual: write APDU into NDEF file,
  // then write the NDEF file length to trigger execution, then read result.

  private async _flashIos(
    image: ProcessedImage,
    onProgress: ProgressCallback,
    imageIndex: number,
  ): Promise<void> {
    try {
      onProgress({
        stage: 'init', percent: 0, currentPacket: 0, totalPackets: 0,
        message: 'Hold phone steady against the tag…',
      });

      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your phone against the e-paper tag',
      });

      // On iOS the NDEF read/write path is used.
      // Each APDU is wrapped in an NDEF text record per Section 6.2
      // and written via the standard NDEF write API.

      // ── Step 1: Verify PIN via NDEF ────────────────────────────────────────
      onProgress({
        stage: 'init', percent: 5, currentPacket: 0, totalPackets: 0,
        message: 'Authenticating…',
      });
      await this._ndefWriteApdu(buildVerifyPin(DEFAULT_PIN));

      // ── Step 2: Set screen type ────────────────────────────────────────────
      const daCommands = buildSetScreenType(
        this.config.manufacturerByte,
        this.config.sizeByte,
        this.config.colorByte,
      );
      for (const cmd of daCommands) {
        await this._ndefWriteApdu(cmd);
      }

      // ── Step 3: Upload packets ─────────────────────────────────────────────
      const blackPackets = buildLoadImageCommands(imageIndex, image.blackBitmap);
      const redPackets = image.redBitmap
        ? buildLoadImageCommands(imageIndex + 1, image.redBitmap)
        : [];
      const allPackets = [...blackPackets, ...redPackets];
      const total = allPackets.length;

      for (let i = 0; i < allPackets.length; i++) {
        onProgress({
          stage: 'uploading',
          percent: 10 + Math.round((i / total) * 70),
          currentPacket: i + 1,
          totalPackets: total,
          message: `Uploading packet ${i + 1} of ${total}…`,
        });
        await this._ndefWriteApdu(allPackets[i]);
      }

      // ── Step 4: Redraw ─────────────────────────────────────────────────────
      onProgress({
        stage: 'refreshing', percent: 80, currentPacket: total, totalPackets: total,
        message: 'Refreshing display… please keep holding',
      });
      await this._ndefWriteApdu(buildRedrawScreen(imageIndex, true, 0x00));

      // Wait mode on iOS since we can't easily poll via NDEF
      await sleep(18_000);

      onProgress({
        stage: 'done', percent: 100, currentPacket: total, totalPackets: total,
        message: 'Display updated successfully!',
      });
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async _transceiveChecked(command: number[]): Promise<number[]> {
    const raw = await NfcManager.isoDepHandler.transceive(command);
    const resp = parseApduResponse(Array.from(raw));
    if (!resp.success) {
      throw new Error(
        `APDU error: SW1=${resp.sw1.toString(16).padStart(2,'0')} ` +
        `SW2=${resp.sw2.toString(16).padStart(2,'0')}`,
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
      const dotStr = '.'.repeat(dots + 1);
      onProgress({
        stage: 'refreshing',
        percent: 80 + Math.min(19, Math.round(((Date.now() - (deadline - REFRESH_TIMEOUT_MS)) / REFRESH_TIMEOUT_MS) * 19)),
        currentPacket: totalPackets,
        totalPackets,
        message: `Refreshing display${dotStr}`,
      });
    }
    throw new Error('Screen refresh timed out. The display may still update — check visually.');
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
    0xD2,          // NDEF flag: short record, not chunked, message begin+end
    0x01,          // Type length
    apdu.length,   // Payload length
    0x65,          // Type: mime application ('e')
    ...apdu,
  ];

  // react-native-nfc-manager NdefRecord format
  return {
    tnf: 2,        // TNF_MIME_MEDIA
    type: [0x65],  // 'e'
    id: [],
    payload,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
