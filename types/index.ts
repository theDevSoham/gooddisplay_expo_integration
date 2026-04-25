// ─── Display Module Types ────────────────────────────────────────────────────

export type DisplaySize = '2.13';

export type DisplayColor = 'bw' | 'bwr'; // black-white | black-white-red

export interface DisplayConfig {
  size: DisplaySize;
  color: DisplayColor;
  /** Pixel width */
  width: number;
  /** Pixel height */
  height: number;
  /** Screen type byte sent in DA command (manufacturer byte) */
  manufacturerByte: string;
  /** Screen size nibble byte */
  sizeByte: string;
  /** Screen color byte */
  colorByte: string;
}

// ─── APDU / NFC Types ────────────────────────────────────────────────────────

export type ApduResponse = {
  data: number[];
  sw1: number;
  sw2: number;
};

export type NfcSessionState =
  | 'idle'
  | 'scanning'
  | 'connected'
  | 'transferring'
  | 'refreshing'
  | 'success'
  | 'error';

// ─── Image Pipeline Types ─────────────────────────────────────────────────────

export interface ProcessedImage {
  /** 1-bit packed bitmap for the black channel (both BW and BWR) */
  blackBitmap: Uint8Array;
  /** 1-bit packed bitmap for the red channel (BWR only), undefined for BW */
  redBitmap?: Uint8Array;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

// ─── Transfer Progress Types ──────────────────────────────────────────────────

export interface TransferProgress {
  stage: 'init' | 'uploading' | 'refreshing' | 'done' | 'error';
  /** 0-100 */
  percent: number;
  currentPacket: number;
  totalPackets: number;
  message: string;
  error?: string;
}

// ─── App State Types ──────────────────────────────────────────────────────────

export interface SelectedImage {
  uri: string;
  width: number;
  height: number;
}
