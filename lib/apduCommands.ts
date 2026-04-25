/**
 * apduCommands.ts
 *
 * Builds raw APDU byte arrays for each ESL command.
 * References: Section 7 of the FMSC ESL User Development Manual.
 *
 * Each function returns a number[] that can be passed directly to
 * NfcManager.isoDepHandler.transceive() on Android or the NDEF
 * wrapper path on iOS.
 */

import { CLA, INS, IMAGE_PACKET_SIZE } from '../constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hex(s: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < s.length; i += 2) {
    result.push(parseInt(s.slice(i, i + 2), 16));
  }
  return result;
}

// ─── Select NDEF Application (Section 6) ─────────────────────────────────────

/**
 * Selects the NDEF application on the ESL tag.
 * Must be called first in every NFC session (iOS NDEF path).
 */
export function buildSelectNdefApp(): number[] {
  const aid = [0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00];
  return [
    0x00,        // CLA
    0xA4,        // INS: SELECT
    0x04,        // P1: select by AID
    0x00,        // P2
    aid.length,  // Lc
    ...aid,
    0x00,        // Le
  ];
}

// ─── Section 7.1: Get RND ─────────────────────────────────────────────────────

/**
 * Retrieves a random number from the tag (used for MAC computation).
 * @param length Number of random bytes to request (1–128)
 */
export function buildGetRnd(length: number = 4): number[] {
  return [CLA.STANDARD, INS.GET_RND, 0x00, 0x00, length];
}

// ─── Section 7.2: Verify PIN ──────────────────────────────────────────────────

/**
 * Authenticates with the USER PIN.
 * Default PIN is [0x11,0x22,0x33,0x44,0x55] per Section 7.2.1.
 */
export function buildVerifyPin(pin: number[]): number[] {
  return [
    CLA.STANDARD,
    INS.VERIFY_PIN,
    0x00,
    0x01,       // P2 = 0x01: USER PIN
    pin.length,
    ...pin,
  ];
}

// ─── Section 7.9: Set Screen Type ('DA') ─────────────────────────────────────

/**
 * Sets the e-ink screen type parameters (manufacturer, size, color).
 *
 * For the 2.13" module (GDN0213BW/GDN0213R):
 *   manufacturerByte = 'F0' (custom driver)
 *   sizeByte         = '00' (2.13", 122×250 variant)
 *   colorByte        = '20' (BW) or '30' (BWR)
 *
 * Sends two DA commands:
 *   1. P1P2=0x0000 → screen type params
 *   2. P1P2=0x0001 → color control params
 */
export function buildSetScreenType(
  manufacturerByte: string,
  sizeByte: string,
  colorByte: string,
): number[][] {
  // Command 1: screen type (P1=0x00, P2=0x00, Lc=0x03)
  const screenTypeData = hex(`${manufacturerByte}${sizeByte}${colorByte}`);
  const cmd1 = [
    CLA.PROPRIETARY,
    INS.SET_SCREEN_TYPE,
    0x00, // P1
    0x00, // P2
    0x03, // Lc
    ...screenTypeData,
  ];

  // Command 2: color control params (P1=0x00, P2=0x01, Lc=0x03)
  // For BW: Data = [0x1B, 0x00, 0x30]  → single image, 2-color, black=00 white=10
  // For BWR: Data = [0x2B, 0x00, 0x30, 0x48] → double image, 3-color
  const isBWR = colorByte === '30' || colorByte === '31';
  const colorControlData = isBWR
    ? [0x2B, 0x00, 0x30, 0x48] // double image: black=00, white=10, red=01
    : [0x1B, 0x00, 0x30];      // single image: black=00, white=10

  const cmd2 = [
    CLA.PROPRIETARY,
    INS.SET_SCREEN_TYPE,
    0x00, // P1
    0x01, // P2: color control
    colorControlData.length,
    ...colorControlData,
  ];

  return [cmd1, cmd2];
}

// ─── Section 7.10: Set Driver Flow ('DB') ─────────────────────────────────────

/**
 * Sends the screen initialization process in TLV format.
 * If data > 255 bytes it is split into chunks automatically.
 * P1=0x00 for last/only packet, P1=0x01 for intermediate packets.
 * P1=0x02 to clear the current driver before re-downloading.
 */
export function buildSetDriverFlow(tlvData: number[]): number[][] {
  const MAX_CHUNK = 0xFF;
  const commands: number[][] = [];

  if (tlvData.length === 0) {
    // Clear existing driver
    return [[CLA.PROPRIETARY, INS.SET_DRIVER_FLOW, 0x02, 0x00, 0x00]];
  }

  for (let offset = 0; offset < tlvData.length; offset += MAX_CHUNK) {
    const chunk = tlvData.slice(offset, offset + MAX_CHUNK);
    const isLast = offset + MAX_CHUNK >= tlvData.length;
    const p1 = isLast ? 0x00 : 0x01;
    commands.push([
      CLA.PROPRIETARY,
      INS.SET_DRIVER_FLOW,
      p1,
      0x00,
      chunk.length,
      ...chunk,
    ]);
  }
  return commands;
}

// ─── Section 7.5: Load Image ('D2') ──────────────────────────────────────────

/**
 * Splits a bitmap into 250-byte packets and builds a D2 command per packet.
 *
 * @param imageIndex  0-based image slot index on the tag
 * @param bitmap      Raw 1-bit packed bitmap bytes
 */
export function buildLoadImageCommands(
  imageIndex: number,
  bitmap: Uint8Array,
): number[][] {
  const commands: number[][] = [];
  let packetSeq = 0;

  for (let offset = 0; offset < bitmap.length; offset += IMAGE_PACKET_SIZE) {
    const chunk = Array.from(bitmap.slice(offset, offset + IMAGE_PACKET_SIZE));
    commands.push([
      CLA.PROPRIETARY,
      INS.LOAD_IMAGE,
      imageIndex,   // P1: image index
      packetSeq,    // P2: packet sequence number
      chunk.length, // Lc
      ...chunk,
    ]);
    packetSeq++;
  }
  return commands;
}

// ─── Section 7.7: Redraw Screen ('D4') ───────────────────────────────────────

/**
 * Triggers the screen refresh.
 *
 * @param imageIndex  Which image slot to display (0-based)
 * @param waitMode    false = immediate return (P2 bit7=1), true = wait (P2 bit7=0)
 * @param powerDelay  P1: power-on delay * 100ms (0 for passive/NFC-powered tags)
 */
export function buildRedrawScreen(
  imageIndex: number = 0,
  waitMode: boolean = false,
  powerDelay: number = 0x00,
): number[] {
  // P2: Bit7 = refresh mode, Bit6-0 = image index
  const p2 = waitMode
    ? (imageIndex & 0x7F)          // bit7=0 → wait mode
    : (0x80 | (imageIndex & 0x7F)); // bit7=1 → immediate return
  return [
    CLA.PROPRIETARY,
    INS.REDRAW_SCREEN,
    powerDelay, // P1
    p2,         // P2
    // No Lc/Data
    0x00,       // Le
  ];
}

// ─── Section 7.12: Get EPD Busy Status ('DE') ─────────────────────────────────

/**
 * Polls whether the e-paper screen has finished refreshing.
 * Response Data[0] = 0x00 means idle/done, 0x01 means still busy.
 */
export function buildGetEpdBusyStatus(): number[] {
  return [
    CLA.PROPRIETARY,
    INS.GET_EPD_BUSY_STATUS,
    0x00, // P1
    0x00, // P2
    // No Lc/Data
    0x01, // Le: expect 1 byte back
  ];
}

// ─── Section 7.4: Get Config Info ('D1') ─────────────────────────────────────

export function buildGetConfigInfo(): number[] {
  return [CLA.STANDARD, INS.GET_CONFIG_INFO, 0x00, 0x00, 0x00];
}

// ─── Section 7.8: Get Image SN ('D5') ─────────────────────────────────────────

export function buildGetImageSN(): number[] {
  return [CLA.STANDARD, INS.GET_IMAGE_SN, 0x00, 0x00, 0x00];
}

// ─── Response Parser ──────────────────────────────────────────────────────────

/**
 * Parses raw transceive bytes into { data, sw1, sw2 }.
 * The last two bytes are always SW1 SW2 per ISO 7816-4.
 */
export function parseApduResponse(raw: number[]): {
  data: number[];
  sw1: number;
  sw2: number;
  success: boolean;
} {
  if (raw.length < 2) {
    return { data: [], sw1: 0x6F, sw2: 0x00, success: false };
  }
  const sw1 = raw[raw.length - 2];
  const sw2 = raw[raw.length - 1];
  const data = raw.slice(0, raw.length - 2);
  return { data, sw1, sw2, success: sw1 === 0x90 && sw2 === 0x00 };
}
